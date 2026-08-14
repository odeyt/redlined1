import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireShopRole, isLastOwner } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseJsonBody, sanitizeError, escapeHtml, isRateLimited, getTrustedSiteUrl } from '@/lib/apiHelpers';
import { InviteCreateSchema, InviteRoleChangeSchema } from '@/lib/schemas';
import { seatLimitFor } from '@/lib/planGate';

/**
 * POST /api/invite — add a staff member to a shop. If the email has no
 *   existing account, a new one is created via Supabase's invite-link
 *   workflow (one-time, expiring link — the user sets their own password).
 *   If the email already has an account, no auth changes are made at all —
 *   they're just added to shop_users and notified.
 * PATCH /api/invite — change an existing member's role within a shop.
 *
 * Caller: must be authenticated via a valid Supabase bearer token AND hold
 *   role 'owner' in the target shop (`shopId`).
 * Resource authorized: the `shopId` in the request body — resolved to the
 *   caller's own shop_users membership row, never trusted from the body.
 *   The operation applies ONLY to that explicit shopId — an owner of shop A
 *   is never authorized to touch shop B, even if they co-own both (no
 *   cross-shop propagation; see CRITICAL 2 in the security review this
 *   fixes).
 * Required role: owner.
 * Treated only as resource identifiers (never as proof of caller identity
 *   or permission): `shopId`, `email`, `role` (the role being *assigned* to
 *   the invitee), `userId`.
 * Cross-shop access prevention: requireShopRole() checks the caller's own
 *   shop_users row for exactly this shopId.
 */
const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  advisor: 'Service Advisor',
  technician: 'Technician',
};

function isAlreadyRegisteredError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists/i.test(error.message ?? '');
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, InviteCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { email, role, shopId } = parsed.data;

  const auth = await requireShopRole(req, shopId, ['owner']);
  if (!auth.ok) return auth.response;

  if (isRateLimited(`invite:shop:${shopId}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many invitations sent. Please try again later.' }, { status: 429 });
  }
  if (isRateLimited(`invite:target:${shopId}:${email}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many invitations sent to this address. Please try again later.' }, { status: 429 });
  }

  const admin = createServerSupabase();
  const siteUrl = getTrustedSiteUrl();
  if (!siteUrl) {
    return NextResponse.json(
      { error: sanitizeError(new Error('NEXT_PUBLIC_SITE_URL is not a valid trusted URL'), 'invite:POST site-url', 'Server misconfiguration — please contact support') },
      { status: 500 },
    );
  }
  const roleLabel = ROLE_LABELS[role] ?? role;

  const { data: shop, error: shopError } = await admin.from('shops').select('name').eq('id', shopId).maybeSingle();
  if (shopError) {
    return NextResponse.json({ error: sanitizeError(shopError, 'invite:POST shop lookup', 'Unable to process invitation') }, { status: 500 });
  }
  const shopName = escapeHtml(shop?.name ?? 'your shop');

  // Bounded lookup — replaces the previous listUsers({ perPage: 1000 })
  // whole-project scan. profiles.email is kept in sync by the
  // on_auth_user_created trigger (supabase/rls_phase7.sql) and by the
  // upsert below for every account this route creates.
  const { data: existingProfile, error: profileLookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (profileLookupError) {
    return NextResponse.json({ error: sanitizeError(profileLookupError, 'invite:POST profile lookup', 'Unable to process invitation') }, { status: 500 });
  }

  const isNewAccount = !existingProfile;

  // Seat cap: only applies when this actually adds a NEW member to this shop
  // — a role change for someone already on shop_users isn't a new seat. A
  // brand-new account (isNewAccount) can never already have a shop_users
  // row for any shop, so that case is unambiguously a new seat with no
  // lookup needed.
  //
  // Checked here, BEFORE generateLink() below, deliberately: generateLink
  // creates a real Supabase Auth user as a side effect, so resolving seat
  // impact first avoids creating an orphaned account for an invite that's
  // about to be rejected anyway.
  //
  // Previously this route had no seat check at all — every plan's
  // advertised cap (Solo: 1, Starter: 3, Professional: 8 — see
  // components/marketing/PricingSection.tsx) was purely marketing copy; a
  // Solo shop could invite unlimited staff via this endpoint with zero
  // pushback.
  let isNewShopMember = true;
  if (existingProfile) {
    const { data: existingMembership } = await admin
      .from('shop_users')
      .select('user_id')
      .eq('shop_id', shopId)
      .eq('user_id', existingProfile.id)
      .maybeSingle();
    isNewShopMember = !existingMembership;
  }

  if (isNewShopMember) {
    // The caller is already confirmed 'owner' of shopId by requireShopRole
    // above — their own plan/trial_ends_at is the shop's plan.
    const { data: ownerProfile } = await admin
      .from('profiles')
      .select('plan, trial_ends_at')
      .eq('id', auth.context.userId)
      .maybeSingle();
    const seatLimit = seatLimitFor(ownerProfile?.plan ?? null, ownerProfile?.trial_ends_at ?? null);

    if (seatLimit !== null) {
      const { data: seatRows, error: seatCountError } = await admin
        .from('shop_users')
        .select('user_id')
        .eq('shop_id', shopId);
      if (seatCountError) {
        return NextResponse.json(
          { error: sanitizeError(seatCountError, 'invite:POST seat count', 'Unable to process invitation') },
          { status: 500 },
        );
      }
      if ((seatRows?.length ?? 0) >= seatLimit) {
        return NextResponse.json(
          {
            error: 'Staff seat limit reached',
            detail: `Your plan includes up to ${seatLimit} technician seat${seatLimit === 1 ? '' : 's'}. Upgrade to add more staff.`,
            upgrade: true,
          },
          { status: 403 },
        );
      }
    }
  }

  let userId: string;
  let inviteActionLink: string | null = null;

  if (existingProfile) {
    userId = existingProfile.id;

    // An existing profile does not mean an existing SIGN-IN. generateLink
    // creates a real auth user as a side effect, so an invitation that failed
    // after that point — a bad redirect URL, a link nobody could open — leaves
    // an account with no password behind it. The next invitation then took
    // this branch and told the person to "sign in with your existing account",
    // which they cannot do: there is nothing to sign in with.
    //
    // Reported exactly that way. Two accounts sat unconfirmed and never
    // signed in while their invitations kept arriving as sign-in prompts.
    //
    // So: if they have never signed in, send them a link that lets them set a
    // password, the same as a brand-new invitee.
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const neverSignedIn = !authUser?.user?.last_sign_in_at;

    if (neverSignedIn) {
      // 'recovery', not 'invite': Supabase refuses to invite an address it
      // already knows, and recovery is the flow that ends at "choose a
      // password" for an account that exists.
      const { data: recoveryData, error: recoveryError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/auth/callback?next=/reset-password` },
      });
      if (recoveryError) {
        return NextResponse.json(
          { error: sanitizeError(recoveryError, 'invite:POST recovery link', 'Unable to send invitation') },
          { status: 502 },
        );
      }
      inviteActionLink = recoveryData?.properties?.action_link ?? null;
    }
  } else {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/reset-password` },
    });

    if (linkError || !linkData?.user) {
      if (isAlreadyRegisteredError(linkError)) {
        // Supabase itself confirms the email is registered even though our
        // profiles lookup missed it (e.g. pre-dates the auto-create
        // trigger). We have no safe, bounded way to resolve their user id
        // without an unbounded scan, so fail closed rather than guess.
        return NextResponse.json(
          { error: 'This email is already registered. Please contact support to add them to this shop.' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: sanitizeError(linkError, 'invite:POST generateLink', 'Unable to send invitation') },
        { status: 502 },
      );
    }

    userId = linkData.user.id;
    inviteActionLink = linkData.properties.action_link;
  }

  // Applies ONLY to the explicitly authorized shopId — no propagation to
  // other shops the caller or the invitee may co-own.
  const { error: membershipError } = await admin
    .from('shop_users')
    .upsert({ shop_id: shopId, user_id: userId, role }, { onConflict: 'shop_id,user_id' });
  if (membershipError) {
    return NextResponse.json(
      { error: sanitizeError(membershipError, 'invite:POST shop_users upsert', 'Unable to add member to shop') },
      { status: 500 },
    );
  }

  const { error: profileUpsertError } = await admin.from('profiles').upsert({ id: userId, email }, { onConflict: 'id' });
  if (profileUpsertError) {
    // Non-fatal — membership already succeeded, which is the operation that
    // matters. Still observed, not swallowed.
    sanitizeError(profileUpsertError, 'invite:POST profile upsert');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const loginUrl = `${siteUrl}/login`;
  let emailWarning: string | undefined;

  try {
    // Keyed on having a set-password link, not on the account being new: an
    // existing account that has never signed in needs exactly the same email.
    if (inviteActionLink) {
      await resend.emails.send({
        from: 'RedlineD1 <noreply@redlined1.com>',
        to: email,
        subject: `You've been invited to ${shopName}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
            <div style="background:#cc0000;padding:20px 28px">
              <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">REDLINED1 <span style="font-size:13px;font-weight:400;opacity:0.8">Staff Portal</span></div>
            </div>
            <div style="padding:28px">
              <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Welcome to ${shopName}</h2>
              <p style="font-size:14px;color:#aaa;margin:0 0 24px">You've been invited as <strong style="color:#fff">${escapeHtml(roleLabel)}</strong>. Click below to set up your account and choose your own password.</p>
              <a href="${escapeHtml(inviteActionLink)}" style="display:inline-block;background:#cc0000;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
                Accept Invitation →
              </a>
              <p style="font-size:12px;color:#666;margin-top:20px">This link is one-time use and expires soon. If you didn't expect this invitation, you can ignore this email.</p>
            </div>
            <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#444;text-align:center">
              ${shopName} · Powered by Redlined1
            </div>
          </div>
        `,
      });
    } else {
      await resend.emails.send({
        from: 'RedlineD1 <noreply@redlined1.com>',
        to: email,
        subject: `You've been added to ${shopName}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
            <div style="background:#cc0000;padding:20px 28px">
              <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">REDLINED1 <span style="font-size:13px;font-weight:400;opacity:0.8">Staff Portal</span></div>
            </div>
            <div style="padding:28px">
              <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">You've been added to ${shopName}</h2>
              <p style="font-size:14px;color:#aaa;margin:0 0 24px">You've been added as <strong style="color:#fff">${escapeHtml(roleLabel)}</strong>. Sign in with your existing Redlined1 account to get started.</p>
              <a href="${loginUrl}" style="display:inline-block;background:#cc0000;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
                Sign In →
              </a>
            </div>
            <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#444;text-align:center">
              ${shopName} · Powered by Redlined1
            </div>
          </div>
        `,
      });
    }
  } catch (e) {
    // Membership was already granted — email delivery failing shouldn't
    // undo that. Observed via server logs, surfaced to the caller as a
    // non-fatal warning, never with the raw exception.
    emailWarning = sanitizeError(e, 'invite:POST resend.send', 'Notification email failed to send');
  }

  // If the email didn't go out, don't leave the workflow in an unclear
  // state: membership already exists in the DB regardless, so give the
  // (already-authorized owner) caller something actionable to hand the
  // invitee directly — the one-time invite link for a new account, or just
  // the login URL for an existing one (they already have credentials).
  const actionLink = emailWarning ? (inviteActionLink ?? loginUrl) : undefined;

  return NextResponse.json({
    success: true,
    email,
    accountStatus: isNewAccount ? 'invited' : 'added_existing',
    ...(emailWarning ? { warning: emailWarning } : {}),
    ...(actionLink ? { actionLink } : {}),
  });
}

export async function PATCH(req: NextRequest) {
  const parsed = await parseJsonBody(req, InviteRoleChangeSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, shopId, role } = parsed.data;

  const auth = await requireShopRole(req, shopId, ['owner']);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();

  const { data: currentRow, error: lookupError } = await admin
    .from('shop_users')
    .select('role')
    .eq('shop_id', shopId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: sanitizeError(lookupError, 'invite:PATCH lookup', 'Unable to update role') }, { status: 500 });
  }
  if (!currentRow) {
    return NextResponse.json({ error: 'Member not found in this shop' }, { status: 404 });
  }

  if (currentRow.role === 'owner' && role !== 'owner' && (await isLastOwner(shopId, userId))) {
    return NextResponse.json({ error: 'Cannot demote the last owner of a shop' }, { status: 409 });
  }

  // Applies ONLY to this explicit shopId — no cross-shop propagation.
  const { error: updateError } = await admin
    .from('shop_users')
    .update({ role })
    .eq('shop_id', shopId)
    .eq('user_id', userId);
  if (updateError) {
    return NextResponse.json({ error: sanitizeError(updateError, 'invite:PATCH update', 'Unable to update role') }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
