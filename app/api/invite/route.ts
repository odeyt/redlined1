import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  advisor: 'Service Advisor',
  technician: 'Technician',
};

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = 'D1-';
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export async function POST(req: NextRequest) {
  try {
    const { email, role, shopId } = await req.json();
    if (!email || !shopId) return NextResponse.json({ error: 'Missing email or shopId' }, { status: 400 });

    const tempPassword = generateTempPassword();
    const siteUrl = 'https://www.redlined1.com';
    const loginUrl = `${siteUrl}/login`;
    const roleLabel = ROLE_LABELS[role] ?? role;

    // Get shop name for the email
    const { data: shop } = await admin.from('shops').select('name').eq('id', shopId).single();
    const shopName = shop?.name ?? 'D1 Imports';

    // Check if user already exists
    const { data: existingList } = await admin.auth.admin.listUsers();
    const existing = existingList?.users?.find(u => u.email === email);

    let userId: string;

    if (existing) {
      // Update their password to the new temp one
      await admin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        email_confirm: true,
      });
      userId = existing.id;
    } else {
      // Create new user with temp password — no magic link needed
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      userId = data.user.id;
    }

    // Find all shops owned by the same owners as the target shop
    // so the new user is added to every location automatically
    const { data: coOwners } = await admin
      .from('shop_users').select('user_id').eq('shop_id', shopId).eq('role', 'owner');
    const ownerIds = (coOwners ?? []).map((r: Record<string, unknown>) => r.user_id as string);

    let allShopIds: string[] = [shopId];
    if (ownerIds.length > 0) {
      const { data: ownerShops } = await admin
        .from('shop_users').select('shop_id').in('user_id', ownerIds).eq('role', 'owner');
      allShopIds = [...new Set((ownerShops ?? []).map((r: Record<string, unknown>) => r.shop_id as string))];
      if (!allShopIds.includes(shopId)) allShopIds.push(shopId);
    }

    // Add user to all locations
    for (const sid of allShopIds) {
      await admin.from('shop_users').upsert({
        shop_id: sid,
        user_id: userId,
        role: role ?? 'manager',
      }, { onConflict: 'shop_id,user_id' });
    }

    // Create/update profile
    await admin.from('profiles').upsert({
      id: userId,
      email,
    }, { onConflict: 'id' });

    // Send welcome email with temp password via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'D1 Imports <noreply@redlined1.com>',
      to: email,
      subject: `You've been added to ${shopName} — Your login details`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
          <div style="background:#cc0000;padding:20px 28px">
            <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">D1 IMPORTS <span style="font-size:13px;font-weight:400;opacity:0.8">Staff Portal</span></div>
          </div>
          <div style="padding:28px">
            <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Welcome to ${shopName}</h2>
            <p style="font-size:14px;color:#aaa;margin:0 0 24px">You've been added as <strong style="color:#fff">${roleLabel}</strong>. Use the credentials below to log in.</p>

            <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:20px 24px;margin-bottom:24px">
              <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">Your Login Details</div>
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#888;width:110px">Portal URL</td>
                  <td style="padding:8px 0;font-size:14px;font-weight:700">
                    <a href="${loginUrl}" style="color:#cc0000">${loginUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#888">Email</td>
                  <td style="padding:8px 0;font-size:14px;font-weight:700;color:#fff">${email}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#888">Temp Password</td>
                  <td style="padding:8px 0">
                    <span style="font-size:18px;font-weight:900;color:#fff;background:rgba(204,0,0,0.2);padding:6px 14px;border-radius:6px;letter-spacing:1px;font-family:monospace">${tempPassword}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#888">Role</td>
                  <td style="padding:8px 0;font-size:14px;font-weight:700;color:#4caf50">${roleLabel}</td>
                </tr>
              </table>
            </div>

            <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.25);border-radius:8px;padding:14px 18px;margin-bottom:24px">
              <p style="font-size:13px;color:#ffc107;margin:0;font-weight:600">⚠️ Change your password after first login</p>
              <p style="font-size:12px;color:#aaa;margin:6px 0 0">Go to Settings → Change Password once you're logged in.</p>
            </div>

            <a href="${loginUrl}" style="display:inline-block;background:#cc0000;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
              Log In Now →
            </a>
          </div>
          <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#444;text-align:center">
            D1 Imports · ${shopName} · Powered by Redlined1
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true, tempPassword, email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId, shopId, role } = await req.json();
    if (!userId || !shopId || !role) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const validRoles = ['owner', 'manager', 'advisor', 'technician'];
    if (!validRoles.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    // Find all shops owned by the same owner(s) as the target shop, then update
    // the member's role in every one of those shops so it stays in sync.
    const { data: coOwners } = await admin
      .from('shop_users').select('user_id').eq('shop_id', shopId).eq('role', 'owner');
    const ownerIds = (coOwners ?? []).map((r: Record<string, unknown>) => r.user_id as string);

    let allShopIds: string[] = [shopId];
    if (ownerIds.length > 0) {
      const { data: ownerShops } = await admin
        .from('shop_users').select('shop_id').in('user_id', ownerIds).eq('role', 'owner');
      allShopIds = [...new Set((ownerShops ?? []).map((r: Record<string, unknown>) => r.shop_id as string))];
      if (!allShopIds.includes(shopId)) allShopIds.push(shopId);
    }

    for (const sid of allShopIds) {
      const { error } = await admin.from('shop_users')
        .update({ role })
        .eq('shop_id', sid)
        .eq('user_id', userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, updatedShops: allShopIds.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
