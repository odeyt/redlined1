import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getOwnerShopId(req: NextRequest): Promise<{ userId: string; shopId: string } | null> {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const { data } = await admin
    .from('shop_users').select('role, shop_id').eq('user_id', user.id).eq('role', 'owner');
  if (!data?.length) return null;
  return { userId: user.id, shopId: data[0].shop_id as string };
}

// GET /api/labor-guide — list all entries for admin panel
export async function GET(req: NextRequest) {
  const owner = await getOwnerShopId(req);
  if (!owner) return NextResponse.json({ error: 'Owner required' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q') ?? '';

  let query = admin
    .from('standard_labor_guides')
    .select('*')
    .eq('shop_id', owner.shopId)
    .order('times_performed', { ascending: false });

  if (search) {
    query = query.or(
      `job_description_raw.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// PATCH /api/labor-guide — update a record (owner can fix typos / bad hours)
export async function PATCH(req: NextRequest) {
  const owner = await getOwnerShopId(req);
  if (!owner) return NextResponse.json({ error: 'Owner required' }, { status: 403 });

  const { id, suggestedHours, jobDescriptionRaw, laborRate } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (suggestedHours !== undefined) {
    patch.suggested_hours = Number(suggestedHours);
    const rate = Number(laborRate ?? 145);
    patch.flat_rate_cost = parseFloat((Number(suggestedHours) * rate).toFixed(2));
  }
  if (laborRate !== undefined) patch.labor_rate = Number(laborRate);
  if (jobDescriptionRaw !== undefined) patch.job_description_raw = jobDescriptionRaw;

  const { error } = await admin
    .from('standard_labor_guides')
    .update(patch)
    .eq('id', id)
    .eq('shop_id', owner.shopId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/labor-guide — remove an erroneous record
export async function DELETE(req: NextRequest) {
  const owner = await getOwnerShopId(req);
  if (!owner) return NextResponse.json({ error: 'Owner required' }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await admin
    .from('standard_labor_guides')
    .delete()
    .eq('id', id)
    .eq('shop_id', owner.shopId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
