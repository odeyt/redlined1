import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_ROLE_PERMISSIONS } from '@/services/shopSettingsService';
import type { RolePermissions } from '@/services/shopSettingsService';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get('shopId');
    if (!shopId) return NextResponse.json({ error: 'Missing shopId' }, { status: 400 });

    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify the token belongs to a real user
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Confirm the user is a member of this shop (service role bypasses RLS)
    const { data: membership } = await getAdmin()
      .from('shop_users')
      .select('role')
      .eq('shop_id', shopId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Read role_permissions from shop_settings with service role (bypasses RLS)
    const { data: settings } = await getAdmin()
      .from('shop_settings')
      .select('role_permissions')
      .eq('shop_id', shopId)
      .maybeSingle();

    const rolePermissions: RolePermissions =
      settings?.role_permissions && Object.keys(settings.role_permissions).length > 0
        ? settings.role_permissions as RolePermissions
        : DEFAULT_ROLE_PERMISSIONS;

    return NextResponse.json({ rolePermissions, role: membership.role });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
