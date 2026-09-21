/**
 * lib/admin/profileDiagnostics.ts
 * SERVER ONLY. Read-only diagnosis of profiles that have no shop_users
 * membership (the owner portal's "Profiles without shop membership").
 *
 * A cause is reported ONLY when a record establishes it:
 *   - auth.users says the email was never confirmed              → email_unverified
 *   - shop_provisioning_claims has a row for the user with no shop → provisioning_claim_without_shop
 *       (shop creation was attempted and did not complete)
 *   - a claim points at a shop but no membership exists            → claim_shop_without_membership
 *   - no auth.users record exists for the profile                  → no_auth_user
 *   - verified, no claim                                           → verified_no_provisioning_evidence
 *       (shop creation was not attempted, OR the profile predates the claim table —
 *        the data cannot tell which, so it is not called either)
 *   - anything that could not be read (a claim would outrank the
 *     unverified/verified causes, so an unreadable claim table → unknown) → unknown
 *
 * Not derivable, and deliberately not classified: an invited team member pending
 * (inviting creates the membership immediately, so no pending-invite record
 * exists) and test/duplicate-account intent. A shared email address is reported
 * as a fact (`duplicateEmailProfiles`), not as a judgement about the account.
 *
 * Output is aggregate counts plus masked rows: a one-way reference, day-level
 * dates and booleans. No email, name or identifier leaves this module. Nothing is
 * ever linked, changed or deleted here.
 */
import 'server-only';
import { getAdminDb } from '@/lib/supabaseServer';
import { accountFingerprint } from '@/lib/admin/fingerprint';
import { allSettledLimited, AUTH_LOOKUP_CONCURRENCY } from '@/lib/admin/concurrency';

type Db = ReturnType<typeof getAdminDb>;

/**
 * Equal to the server's own row limit (Supabase's PostgREST max-rows, 1000 by
 * default), which cuts a larger read silently. A read that reaches it may be
 * incomplete, and an incomplete membership list would report linked profiles as
 * unlinked, so reaching it means "too many to diagnose", never a partial answer.
 */
const SCAN_CAP = 1000;
const AUTH_CAP = 200;
const ID_CHUNK = 100;

export const PROFILE_CAUSES = [
  'email_unverified',
  'provisioning_claim_without_shop',
  'claim_shop_without_membership',
  'no_auth_user',
  'verified_no_provisioning_evidence',
  'unknown',
] as const;
export type ProfileCause = typeof PROFILE_CAUSES[number];

export const PROFILE_CAUSE_LABELS: Record<ProfileCause, string> = {
  email_unverified: 'Email not verified',
  provisioning_claim_without_shop: 'Shop creation attempted, not completed',
  claim_shop_without_membership: 'A shop was created but the membership is missing',
  no_auth_user: 'Profile has no sign-in account',
  verified_no_provisioning_evidence: 'Verified, no shop-creation record (cause not established)',
  unknown: 'Unknown (data unavailable)',
};

export const PROFILE_NOT_DERIVABLE = ['invited team member pending', 'test or abandoned-account intent'];

export interface ProfileDiagnostic {
  /** One-way reference (lib/admin/fingerprint.ts). */
  profileRef: string;
  cause: ProfileCause;
  emailVerified: boolean | null;
  /** YYYY-MM-DD, or null. */
  accountCreatedDay: string | null;
  lastSignInDay: string | null;
  provisioningClaim: 'none' | 'without_shop' | 'with_shop' | 'unknown';
  /** profiles.shop_id (the legacy pointer) is set even though there is no membership. */
  legacyShopPointer: boolean;
  /** Another profile shares this email address (case-insensitive). A fact, not a verdict. */
  duplicateEmail: boolean;
}

export interface ProfileDiagnosticsSummary {
  available: boolean;
  reason: string | null;
  profilesWithoutMembership: number;
  byCause: Record<ProfileCause, number>;
  duplicateEmailProfiles: number;
  /** Profiles whose account details were not looked up because of the per-request cap. */
  notExamined: number;
  notDerivable: string[];
}

const emptyByCause = (): Record<ProfileCause, number> => ({
  email_unverified: 0, provisioning_claim_without_shop: 0, claim_shop_without_membership: 0,
  no_auth_user: 0, verified_no_provisioning_evidence: 0, unknown: 0,
});

export function unavailableDiagnostics(reason: string): ProfileDiagnosticsSummary {
  return {
    available: false, reason, profilesWithoutMembership: 0, byCause: emptyByCause(),
    duplicateEmailProfiles: 0, notExamined: 0, notDerivable: PROFILE_NOT_DERIVABLE,
  };
}

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

/** Pure classification, exported for unit tests. */
export function classifyProfile(f: {
  authFound: boolean | null;          // null = lookup failed
  emailVerified: boolean | null;
  claim: ProfileDiagnostic['provisioningClaim'];
}): ProfileCause {
  if (f.authFound === false) return 'no_auth_user';
  if (f.claim === 'without_shop') return 'provisioning_claim_without_shop';
  if (f.claim === 'with_shop') return 'claim_shop_without_membership';
  // A claim would outrank everything below, so if the claim table could not be read
  // (or the auth lookup failed) no further cause is established.
  if (f.claim === 'unknown' || f.authFound === null || f.emailVerified === null) return 'unknown';
  if (f.emailVerified === false) return 'email_unverified';
  return 'verified_no_provisioning_evidence';
}

export async function getProfileDiagnostics(): Promise<{ summary: ProfileDiagnosticsSummary; items: ProfileDiagnostic[] }> {
  try {
    const db: Db = getAdminDb();
    const [profilesRes, membersRes] = await Promise.all([
      // Ordered so that when more than AUTH_CAP profiles need examining, the same ones are
      // examined every time (an unordered read could return a different subset per request).
      db.from('profiles').select('id, email, shop_id').order('id', { ascending: true }).limit(SCAN_CAP),
      db.from('shop_users').select('user_id').limit(SCAN_CAP),
    ]);
    if (profilesRes.error || membersRes.error) {
      return { summary: unavailableDiagnostics('Profiles or memberships could not be read.'), items: [] };
    }
    const profiles = (profilesRes.data ?? []) as Array<{ id: string; email: string | null; shop_id: string | null }>;
    const members = (membersRes.data ?? []) as Array<{ user_id: string }>;
    if (profiles.length >= SCAN_CAP || members.length >= SCAN_CAP) {
      return { summary: unavailableDiagnostics('Too many rows to diagnose safely.'), items: [] };
    }

    const linked = new Set(members.map(m => m.user_id));
    const orphans = profiles.filter(p => !linked.has(p.id));

    const emailCounts = new Map<string, number>();
    for (const p of profiles) {
      const e = (p.email ?? '').trim().toLowerCase();
      if (e) emailCounts.set(e, (emailCounts.get(e) ?? 0) + 1);
    }
    const isDuplicate = (p: { email: string | null }) => {
      const e = (p.email ?? '').trim().toLowerCase();
      return !!e && (emailCounts.get(e) ?? 0) > 1;
    };

    // Provisioning claims (attempted shop creation). Missing table => unknown, not "none".
    const claimByUser = new Map<string, string | null>();
    let claimsReadable = true;
    for (let i = 0; i < orphans.length; i += ID_CHUNK) {
      const { data, error } = await db
        .from('shop_provisioning_claims')
        .select('user_id, shop_id')
        .in('user_id', orphans.slice(i, i + ID_CHUNK).map(p => p.id));
      if (error) { claimsReadable = false; break; }
      for (const c of (data ?? []) as Array<{ user_id: string; shop_id: string | null }>) claimByUser.set(c.user_id, c.shop_id);
    }

    const examined = orphans.slice(0, AUTH_CAP);
    const authResults = await allSettledLimited(examined, AUTH_LOOKUP_CONCURRENCY, p => db.auth.admin.getUserById(p.id));

    const items: ProfileDiagnostic[] = examined.map((p, idx) => {
      const r = authResults[idx];
      let authFound: boolean | null = null;
      let emailVerified: boolean | null = null;
      let created: string | null = null;
      let last: string | null = null;
      if (r.status === 'fulfilled') {
        const { data, error } = r.value;
        if (data?.user) {
          authFound = true;
          const u = data.user as { email_confirmed_at?: string | null; created_at?: string; last_sign_in_at?: string | null };
          emailVerified = !!u.email_confirmed_at;
          created = day(u.created_at); last = day(u.last_sign_in_at);
        } else if (error && /not found/i.test(error.message ?? '')) {
          authFound = false;
        }
      }
      const claim: ProfileDiagnostic['provisioningClaim'] = !claimsReadable ? 'unknown'
        : !claimByUser.has(p.id) ? 'none'
        : claimByUser.get(p.id) ? 'with_shop' : 'without_shop';

      return {
        profileRef: accountFingerprint(p.id),
        cause: classifyProfile({ authFound, emailVerified, claim }),
        emailVerified, accountCreatedDay: created, lastSignInDay: last,
        provisioningClaim: claim, legacyShopPointer: !!p.shop_id, duplicateEmail: isDuplicate(p),
      };
    }).sort((a, b) => a.profileRef.localeCompare(b.profileRef));

    const byCause = emptyByCause();
    for (const i of items) byCause[i.cause]++;

    return {
      summary: {
        available: true, reason: null, profilesWithoutMembership: orphans.length, byCause,
        duplicateEmailProfiles: orphans.filter(isDuplicate).length,
        notExamined: Math.max(0, orphans.length - examined.length), notDerivable: PROFILE_NOT_DERIVABLE,
      },
      items,
    };
  } catch {
    return { summary: unavailableDiagnostics('Profile diagnostics could not be computed.'), items: [] };
  }
}

export interface ProfileDiagnosticsPage {
  summary: ProfileDiagnosticsSummary;
  items: ProfileDiagnostic[];
  page: number;
  pageSize: number;
  total: number;
}

const MAX_PAGE_SIZE = 50;

export async function listProfileDiagnostics(params: { page?: number | string; pageSize?: number | string }): Promise<ProfileDiagnosticsPage> {
  const page = Math.max(1, Math.floor(Number(params.page ?? 1)) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(params.pageSize ?? 25)) || 25));
  const { summary, items } = await getProfileDiagnostics();
  const start = (page - 1) * pageSize;
  return { summary, items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}
