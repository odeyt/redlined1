/**
 * GET /api/admin/accounts
 * Platform-owner only. Paginated, searchable, filterable signup directory.
 * Read-only. Never modifies account, shop, or billing state.
 *
 * Query params are validated and clamped in lib/admin/accountsData.ts
 * (page, pageSize, search length, sortKey/status allowlists) — this route
 * never forwards raw client input into a query unchecked.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { listAccounts, ACCOUNT_SORT_KEYS, ACCOUNT_STATUS_FILTERS } from '@/lib/admin/accountsData';
import { sanitizeError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const params = {
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    archived: url.searchParams.get('archived') ?? undefined,
    sortKey: url.searchParams.get('sortKey') ?? undefined,
    sortDir: url.searchParams.get('sortDir') ?? undefined,
  };

  try {
    const result = await listAccounts(params);
    return NextResponse.json({
      ...result,
      meta: { sortKeys: ACCOUNT_SORT_KEYS, statusFilters: ACCOUNT_STATUS_FILTERS },
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/accounts') }, { status: 500 });
  }
}
