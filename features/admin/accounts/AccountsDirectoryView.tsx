/**
 * features/admin/accounts/AccountsDirectoryView.tsx
 * INTERNAL PLATFORM-OWNER ONLY. A plain Server Component — no 'use client',
 * no hooks, no client-side fetch. Search, status filtering, sorting, and
 * pagination are all plain URL searchParams, driven by a GET <form> and
 * <Link>s — every state change is a full navigation to a shareable URL, and
 * the actual data read (lib/admin/accountsData.ts) happens server-side in
 * app/admin/accounts/page.tsx before this component ever renders.
 */
import Link from 'next/link';
import { C, fmtDate } from '@/features/admin/shared/theme';
import { AdminHeader } from '@/features/admin/shared/AdminHeader';
import { buildHref } from '@/features/admin/shared/queryString';
import type { AccountArchiveFilter, AccountListItem, AccountListResult, AccountSortKey, AccountStatusFilter } from '@/lib/admin/accountsData';
import { ACCOUNT_STATUS_LABELS, isLoginInactive, LOGIN_INACTIVITY_THRESHOLD_DAYS, type AccountStatus } from '@/lib/admin/accountStatus';
import { displayPlan, EXPIRED_TRIAL_NOTE } from '@/lib/admin/terminology';

const STATUS_OPTIONS: Array<{ value: AccountStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'free', label: ACCOUNT_STATUS_LABELS.free },
  { value: 'trialing', label: ACCOUNT_STATUS_LABELS.trialing },
  { value: 'trial_ending_soon', label: 'Trial ending soon (≤7d)' },
  { value: 'active_paid', label: ACCOUNT_STATUS_LABELS.active_paid },
  { value: 'cancel_scheduled', label: ACCOUNT_STATUS_LABELS.cancel_scheduled },
  { value: 'past_due', label: 'Past due / payment failed' },
  { value: 'cancelled_access_retained', label: ACCOUNT_STATUS_LABELS.cancelled_access_retained },
  { value: 'expired', label: ACCOUNT_STATUS_LABELS.expired },
  { value: 'paid_unverified', label: ACCOUNT_STATUS_LABELS.paid_unverified },
  { value: 'billing_mismatch', label: ACCOUNT_STATUS_LABELS.billing_mismatch },
];

const ARCHIVE_OPTIONS: Array<{ value: AccountArchiveFilter; label: string }> = [
  { value: 'all', label: 'All shops' },
  { value: 'active', label: 'Active shops' },
  { value: 'archived', label: 'Archived shops' },
  { value: 'internal', label: 'Internal shops' },
];

const SORT_COLUMNS: Array<{ key: AccountSortKey; label: string }> = [
  { key: 'name', label: 'Shop' },
  { key: 'email', label: 'Primary contact email' },
  { key: 'trial_ends_at', label: 'Trial ends' },
  { key: 'created_at', label: 'Signed up' },
];

function StatusBadge({ status }: { status: AccountStatus }) {
  const colorMap: Record<AccountStatus, string> = {
    free: C.muted, trialing: C.info, active_paid: C.success, cancel_scheduled: C.warning, past_due: C.warning,
    cancelled_access_retained: C.info, expired: C.muted, paid_unverified: C.warning, billing_mismatch: C.danger, internal: C.muted,
  };
  const color = colorMap[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: color + '22', color, whiteSpace: 'nowrap' }}>
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}

export interface EffectiveParams {
  page: number;
  search: string;
  status: AccountStatusFilter;
  archived: AccountArchiveFilter;
  sortKey: AccountSortKey;
  sortDir: 'asc' | 'desc';
}

export function AccountsDirectoryView({ result, params }: { result: AccountListResult; params: EffectiveParams }) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const base = '/admin/accounts';

  function hrefWith(overrides: Partial<EffectiveParams>): string {
    const merged = { ...params, ...overrides };
    return buildHref(base, {
      search: merged.search || undefined,
      status: merged.status === 'all' ? undefined : merged.status,
      archived: merged.archived === 'all' ? undefined : merged.archived,
      sortKey: merged.sortKey === 'created_at' ? undefined : merged.sortKey,
      sortDir: merged.sortDir === 'desc' ? undefined : merged.sortDir,
      page: merged.page === 1 ? undefined : merged.page,
    });
  }

  function sortHref(key: AccountSortKey): string {
    const nextDir: 'asc' | 'desc' = params.sortKey === key && params.sortDir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sortKey: key, sortDir: nextDir, page: 1 });
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AdminHeader title="Accounts" active="/admin/accounts" />

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '32px 24px' }}>
        <form action={base} method="GET" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <input type="hidden" name="status" value={params.status} />
          <input type="hidden" name="archived" value={params.archived} />
          <input type="hidden" name="sortKey" value={params.sortKey} />
          <input type="hidden" name="sortDir" value={params.sortDir} />
          <input
            name="search"
            defaultValue={params.search}
            placeholder="Search shop name or contact email…"
            maxLength={100}
            style={{
              flex: '1 1 280px', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.card, color: C.text, fontSize: 13,
            }}
          />
          <button
            type="submit"
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {ARCHIVE_OPTIONS.map(opt => (
            <Link
              key={opt.value}
              href={hrefWith({ archived: opt.value, page: 1 })}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, textDecoration: 'none',
                border: `1px solid ${params.archived === opt.value ? C.accent : C.border}`,
                background: params.archived === opt.value ? C.accent + '22' : 'transparent',
                color: params.archived === opt.value ? C.accent : C.muted,
              }}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {STATUS_OPTIONS.map(opt => (
            <Link
              key={opt.value}
              href={hrefWith({ status: opt.value, page: 1 })}
              style={{
                padding: '6px 12px', borderRadius: 99, fontSize: 12, textDecoration: 'none',
                border: `1px solid ${params.status === opt.value ? C.accent : C.border}`,
                background: params.status === opt.value ? C.accent + '22' : 'transparent',
                color: params.status === opt.value ? C.accent : C.muted,
              }}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {result.truncated && (
          <div style={{ background: C.warning + '18', border: `1px solid ${C.warning}44`, borderRadius: 10, padding: '10px 16px', color: C.warning, fontSize: 13, marginBottom: 16 }}>
            ⚠ Only the {result.maxScanRows} most recently created shops (matching this search, if any) were scanned. Older shops matching this filter may be missing from this result, not just from the current page.
          </div>
        )}

        {result.items.length === 0 && (
          <div style={{ color: C.muted, fontSize: 14, padding: 40, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            No accounts match this filter.
          </div>
        )}

        {result.items.length > 0 && (
          <>
            {/* minWidth forces the table wider than a phone viewport so it scrolls
                horizontally inside this box, instead of every cell word-wrapping
                into an unreadable stack — the failure mode a real narrow-viewport
                check caught here. */}
            <div style={{ overflowX: 'auto', maxWidth: '100%', border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted, background: C.surface }}>
                    {SORT_COLUMNS.map(col => (
                      <th key={col.key} style={{ padding: '10px 12px' }}>
                        <Link href={sortHref(col.key)} style={{ color: params.sortKey === col.key ? C.text : C.muted, textDecoration: 'none' }}>
                          {col.label} {params.sortKey === col.key ? (params.sortDir === 'asc' ? '▲' : '▼') : ''}
                        </Link>
                      </th>
                    ))}
                    <th style={{ padding: '10px 12px' }}>Owner</th>
                    <th style={{ padding: '10px 12px' }}>Members</th>
                    <th style={{ padding: '10px 12px' }}>Plan</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((a: AccountListItem) => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}44` }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <Link href={`/admin/accounts/${a.id}`} style={{ color: C.info, textDecoration: 'none', fontWeight: 600 }}>{a.shopName}</Link>
                        {a.shopArchived ? ' (archived)' : ''}
                        {a.billingMismatch && (
                          <span title="Billing mismatch — see account detail" style={{ marginLeft: 6, color: C.warning }}>⚠</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>{a.primaryContactEmail ?? '—'}</td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>
                        {a.trialEndsAt ? `${fmtDate(a.trialEndsAt)}${a.trialDaysLeft !== null ? ` (${a.trialDaysLeft}d)` : ''}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>{fmtDate(a.createdAt)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {a.ownerResolved ? 'Resolved' : 'Unresolved'}
                        {isLoginInactive(a.lastSignInAt) && (
                          <span
                            title={`No login in ${LOGIN_INACTIVITY_THRESHOLD_DAYS}+ days — login recency only, not a measure of feature or product use`}
                            style={{ marginLeft: 6, fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 99, padding: '1px 6px' }}
                          >
                            no recent login
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>{a.memberCount}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {a.trialExpired
                          ? <span title={EXPIRED_TRIAL_NOTE} style={{ color: C.muted }}>{displayPlan(a)}</span>
                          : displayPlan(a)}
                      </td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={a.status} /></td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>
                        {a.lastSignInAt === undefined ? 'Unavailable' : a.lastSignInAt === null ? 'Never' : fmtDate(a.lastSignInAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13, color: C.muted, flexWrap: 'wrap', gap: 12 }}>
              <span>{result.total} account{result.total === 1 ? '' : 's'} — page {result.page} of {totalPages}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {params.page > 1 ? (
                  <Link href={hrefWith({ page: params.page - 1 })} style={pagerLinkStyle}>← Prev</Link>
                ) : (
                  <span style={pagerDisabledStyle}>← Prev</span>
                )}
                {params.page < totalPages ? (
                  <Link href={hrefWith({ page: params.page + 1 })} style={pagerLinkStyle}>Next →</Link>
                ) : (
                  <span style={pagerDisabledStyle}>Next →</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pagerLinkStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
  background: 'transparent', color: C.text, fontSize: 12, textDecoration: 'none',
};

const pagerDisabledStyle: React.CSSProperties = {
  ...pagerLinkStyle, color: C.border,
};
