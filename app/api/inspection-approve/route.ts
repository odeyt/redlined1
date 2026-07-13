import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// POST: customer submits approval decision via share token (public — no auth)
export async function POST(req: NextRequest) {
  try {
    const { token, approvedBy, approvedItems, declinedItems, customerMessage } = await req.json();

    if (!token || !approvedBy?.trim()) {
      return NextResponse.json({ error: 'Token and name are required.' }, { status: 400 });
    }

    const { data: ins, error } = await getAdmin()
      .from('inspections')
      .select('id, status, customer_approval')
      .eq('share_token', token)
      .single();

    if (error || !ins) return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 });

    if (ins.customer_approval?.approvedAt) {
      return NextResponse.json({ error: 'This inspection has already been approved.' }, { status: 409 });
    }

    const allDeclined = (approvedItems ?? []).length === 0 && (declinedItems ?? []).length > 0;
    const partial = (approvedItems ?? []).length > 0 && (declinedItems ?? []).length > 0;
    const decision = allDeclined ? 'declined' : partial ? 'partial' : 'approved';

    const approval = {
      approvedBy: approvedBy.trim(),
      approvedAt: new Date().toISOString(),
      decision,
      approvedItems: approvedItems ?? [],
      declinedItems: declinedItems ?? [],
      customerMessage: customerMessage?.trim() ?? '',
    };

    const newStatus =
      decision === 'approved' ? 'Customer Approved' :
      decision === 'partial'  ? 'Partially Approved' :
                                'Customer Declined';

    await getAdmin().from('inspections').update({
      customer_approval: approval,
      status: newStatus,
    }).eq('id', ins.id);

    return NextResponse.json({ ok: true, decision, newStatus });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

// GET: fetch current approval state by token (for polling / re-load)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const { data: ins, error } = await getAdmin()
      .from('inspections')
      .select('customer_approval, status')
      .eq('share_token', token)
      .single();

    if (error || !ins) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ customerApproval: ins.customer_approval ?? null, status: ins.status });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
