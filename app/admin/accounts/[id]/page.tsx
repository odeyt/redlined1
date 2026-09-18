/**
 * /admin/accounts/[id] — Platform owner only. Read-only shop/account
 * detail. [id] is shops.id — the account directory's one canonical
 * identifier. A Server Component: guard and data read both happen
 * server-side before any HTML is sent.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { getAccountDetail } from '@/lib/admin/accountsData';
import { AccountDetailView } from '@/features/admin/accounts/AccountDetailView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Account Detail — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

const ShopIdSchema = z.string().trim().uuid();

export default async function AdminAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOwnerPage();
  const { id } = await params;

  const parsed = ShopIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const account = await getAccountDetail(parsed.data);
  if (!account) notFound();

  return <AccountDetailView account={account} />;
}
