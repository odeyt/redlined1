import { NextRequest, NextResponse } from 'next/server';
import { getServerDb, getAdminDb } from '@/lib/supabaseServer';
import { signStoredUrls } from '@/lib/storage/signServer';

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// POST: generate or return existing share token for an inspection
export async function POST(req: NextRequest) {
  try {
    const { inspectionId, shopId } = await req.json();
    if (!inspectionId || !shopId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const authHeader = req.headers.get('authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    const db = await getServerDb(jwt || undefined);

    const { data: ins, error } = await db
      .from('inspections')
      .select('id, share_token')
      .eq('id', inspectionId)
      .eq('shop_id', shopId)
      .single();

    if (error) return NextResponse.json({ error: error.message || 'Database error' }, { status: 500 });
    if (!ins) return NextResponse.json({ error: 'Inspection not found — verify shop ID matches' }, { status: 404 });

    if (ins.share_token) return NextResponse.json({ token: ins.share_token });

    const token = generateToken();
    const { error: updErr } = await db
      .from('inspections')
      .update({ share_token: token })
      .eq('id', inspectionId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ token });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

// GET: fetch inspection by share token (public — no auth required)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const db = getAdminDb();
    const { data: ins, error } = await db
      .from('inspections')
      .select('*')
      .eq('share_token', token)
      .single();
    if (error || !ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const { data: shop }     = await db.from('shops').select('name').eq('id', ins.shop_id).single();
    const { data: settings } = await db.from('shop_settings').select('*').eq('shop_id', ins.shop_id).single();

    let items: Array<Record<string, unknown>> = [];
    try {
      const raw = ins.items;
      items = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    } catch { items = []; }

    // The customer opening this link has no session and cannot sign a storage
    // URL themselves, so we hand them short-lived signed ones. Batched: a
    // report can carry dozens of photos plus the logo, and signing them one
    // at a time is what makes the page crawl. Anything that fails to sign
    // keeps its stored URL rather than vanishing from the report.
    const signed = await signStoredUrls([
      settings?.logo_url,
      ...items.map(it => (typeof it.photoUrl === 'string' ? it.photoUrl : null)),
    ]);
    const signedItems = items.map(it =>
      typeof it.photoUrl === 'string' && signed.has(it.photoUrl)
        ? { ...it, photoUrl: signed.get(it.photoUrl) }
        : it,
    );

    return NextResponse.json({
      inspection: { ...ins, items: signedItems },
      shopName:     shop?.name         ?? 'My Shop',
      shopPhone:    settings?.phone    ?? '',
      shopAddress:  settings?.address  ?? '',
      shopLogoUrl:  signed.get(settings?.logo_url ?? '') ?? settings?.logo_url ?? '',
      shopEmail:    settings?.email    ?? '',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
