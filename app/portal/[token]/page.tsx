/**
 * Customer Portal — Server Component, reached signed out by the customer.
 *
 * Data is fetched server-side with the service role (bypasses RLS), so the
 * scoping in lib/portal/loadPortal.ts IS the access control: the token
 * resolves to exactly one customer and that customer's shop, and every query
 * is filtered by both. A record carrying this customer's id under another
 * shop is not shown.
 *
 * The token itself is not sent back to the browser in the page data; the
 * client reads it from its own URL when it needs it.
 */
import type { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase-server';
import { signStoredUrls } from '@/lib/storage/signServer';
import { loadPortal } from '@/lib/portal/loadPortal';
import { PortalClient } from './PortalClient';

// Per-customer and token-bearing: never cached, never indexed.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ token: string }>;
}

export default async function CustomerPortalPage({ params }: Props) {
  const { token } = await params;
  const data = await loadPage(token);
  return data ? <PortalClient data={data} /> : <NotFound />;
}

/** The service-role client is created here; a missing env var fails closed. */
async function loadPage(token: string) {
  try {
    return await loadPortal(createServerSupabase(), token, values => signStoredUrls(values));
  } catch (e) {
    console.error('[portal page] load failed', { message: e instanceof Error ? e.message : 'unknown error' });
    return null;
  }
}

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, margin: 0 }}>Portal Not Found</h1>
        <p style={{ color: '#666', lineHeight: 1.6, marginTop: 12 }}>
          This link is invalid or has expired. Please contact your shop for a new portal link.
        </p>
      </div>
    </div>
  );
}
