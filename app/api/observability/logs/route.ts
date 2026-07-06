/**
 * GET /api/observability/logs
 * Owner/manager only — returns recent observability logs for the current shop.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { listRecentLogs } from '@/services/observabilityService';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ logs: [] });

    const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? '';
    if (!shopId) return NextResponse.json({ logs: [] });

    // Verify owner or manager role
    const { data: suRow } = await supabase
      .from('shop_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('shop_id', shopId)
      .maybeSingle();

    const role = (suRow as { role?: string } | null)?.role ?? '';
    if (!['owner', 'manager'].includes(role)) {
      return NextResponse.json({ logs: [] });
    }

    const logs = await listRecentLogs(shopId, 50);
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: [] });
  }
}
