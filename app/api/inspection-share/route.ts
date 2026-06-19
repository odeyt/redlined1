import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

// POST: generate or return existing share token for an inspection
export async function POST(req: NextRequest) {
  try {
    const { inspectionId, shopId } = await req.json();
    if (!inspectionId || !shopId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const { data: ins, error } = await admin
      .from('inspections')
      .select('id, share_token')
      .eq('id', inspectionId)
      .eq('shop_id', shopId)
      .single();
    if (error) return NextResponse.json({ error: error.message || 'Database error' }, { status: 500 });
    if (!ins) return NextResponse.json({ error: 'Inspection not found — check shop ID' }, { status: 404 });

    if (ins.share_token) return NextResponse.json({ token: ins.share_token });

    const token = generateToken();
    await admin.from('inspections').update({ share_token: token }).eq('id', inspectionId);
    return NextResponse.json({ token });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

// GET: fetch inspection by share token (public — no auth)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const { data: ins, error } = await admin
      .from('inspections')
      .select('*')
      .eq('share_token', token)
      .single();
    if (error || !ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const { data: shop } = await admin.from('shops').select('name').eq('id', ins.shop_id).single();
    const { data: settings } = await admin.from('shop_settings').select('*').eq('shop_id', ins.shop_id).single();

    let items = [];
    try {
      const raw = ins.items;
      items = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    } catch { items = []; }

    return NextResponse.json({
      inspection: {
        ...ins,
        items,
      },
      shopName: shop?.name ?? 'D1 Imports',
      shopPhone: settings?.phone ?? '',
      shopAddress: settings?.address ?? '',
      shopLogoUrl: settings?.logo_url ?? '',
      shopEmail: settings?.email ?? '',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
