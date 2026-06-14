import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, role, shopId } = await req.json();
    if (!email || !shopId) return NextResponse.json({ error: 'Missing email or shopId' }, { status: 400 });

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.redlined1.com'}/auth/callback`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Link to shop
    await admin.from('shop_users').upsert({
      shop_id: shopId,
      user_id: data.user.id,
      role: role ?? 'manager',
    }, { onConflict: 'shop_id,user_id' });

    // Create profile row if missing
    await admin.from('profiles').upsert({
      id: data.user.id,
      email,
    }, { onConflict: 'id' });

    return NextResponse.json({ success: true });
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
    const { error } = await admin.from('shop_users')
      .update({ role })
      .eq('shop_id', shopId)
      .eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
