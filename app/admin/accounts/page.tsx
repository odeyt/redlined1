/**
 * /admin/accounts — Platform owner only. Signup/customer directory.
 * A Server Component: filter/sort/search/page state lives entirely in the
 * URL's searchParams (read here, sanitized, passed straight into
 * listAccounts()) — no client-side fetch, no useEffect.
 */
import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import {
  listAccounts,
  sanitizeSearch, sanitizeStatusFilter, sanitizeArchiveFilter, sanitizeSortKey, sanitizeSortDir, clampPage,
} from '@/lib/admin/accountsData';
import { AccountsDirectoryView } from '@/features/admin/accounts/AccountsDirectoryView';
import { firstParam, type RawSearchParams } from '@/features/admin/shared/queryString';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Accounts — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePlatformOwnerPage();
  const sp = await searchParams;

  const params = {
    page: clampPage(firstParam(sp.page)),
    search: sanitizeSearch(firstParam(sp.search)),
    status: sanitizeStatusFilter(firstParam(sp.status)),
    archived: sanitizeArchiveFilter(firstParam(sp.archived)),
    sortKey: sanitizeSortKey(firstParam(sp.sortKey)),
    sortDir: sanitizeSortDir(firstParam(sp.sortDir)),
  };

  const result = await listAccounts(params);

  return <AccountsDirectoryView result={result} params={params} />;
}
