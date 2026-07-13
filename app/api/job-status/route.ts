import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getAdmin() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }); }

const STAGES = [
  { id: 'checked_in',    label: 'Checked In',       icon: '📋' },
  { id: 'inspecting',    label: 'Being Inspected',   icon: '🔍' },
  { id: 'waiting_parts', label: 'Waiting for Parts', icon: '📦' },
  { id: 'in_repair',     label: 'In Repair',         icon: '🔧' },
  { id: 'quality_check', label: 'Quality Check',     icon: '✅' },
  { id: 'ready',         label: 'Ready for Pickup',  icon: '🎉' },
];

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

// PUT — generate or return existing status token for a job card (shop auth required)
export async function PUT(req: NextRequest) {
  try {
    const { jobId, shopId } = await req.json();
    if (!jobId || !shopId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const { data: job, error } = await getAdmin()
      .from('job_cards').select('id, status_token, repair_stage, stage_history')
      .eq('id', jobId).eq('shop_id', shopId).single();
    if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    if (job.status_token) return NextResponse.json({ token: job.status_token, stage: job.repair_stage, history: job.stage_history ?? [] });

    const token = generateToken();
    // Initialize with checked_in in history
    const history = [{ stage: 'checked_in', label: 'Checked In', icon: '📋', advancedAt: new Date().toISOString(), notifiedSms: false, notifiedEmail: false }];
    await getAdmin().from('job_cards').update({ status_token: token, repair_stage: 'checked_in', stage_history: history }).eq('id', jobId);
    return NextResponse.json({ token, stage: 'checked_in', history });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// POST — advance to next stage (shop auth required)
export async function POST(req: NextRequest) {
  try {
    const { jobId, shopId, stage, notifiedSms, notifiedEmail } = await req.json();
    if (!jobId || !shopId || !stage) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const stageInfo = STAGES.find(s => s.id === stage);
    if (!stageInfo) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

    const { data: job, error } = await getAdmin()
      .from('job_cards').select('id, stage_history').eq('id', jobId).eq('shop_id', shopId).single();
    if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const history = [...(job.stage_history ?? []), {
      stage, label: stageInfo.label, icon: stageInfo.icon,
      advancedAt: new Date().toISOString(),
      notifiedSms: notifiedSms ?? false,
      notifiedEmail: notifiedEmail ?? false,
    }];

    await getAdmin().from('job_cards').update({ repair_stage: stage, stage_history: history }).eq('id', jobId);
    return NextResponse.json({ ok: true, stage, history });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// GET — public fetch by token (no auth)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const { data: job, error } = await getAdmin()
      .from('job_cards').select('id, customer, vehicle, service_type, repair_stage, stage_history, shop_id, check_in_date')
      .eq('status_token', token).single();
    if (error || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: shop } = await getAdmin().from('shops').select('name').eq('id', job.shop_id).single();
    const { data: settings } = await getAdmin().from('shop_settings').select('phone, address, logo_url, email').eq('shop_id', job.shop_id).single();

    return NextResponse.json({
      job: {
        customer: job.customer,
        vehicle: job.vehicle,
        serviceType: job.service_type,
        repairStage: job.repair_stage ?? 'checked_in',
        stageHistory: job.stage_history ?? [],
        checkInDate: job.check_in_date,
      },
      stages: STAGES,
      shopName: shop?.name ?? '',
      shopPhone: settings?.phone ?? '',
      shopAddress: settings?.address ?? '',
      shopLogoUrl: settings?.logo_url ?? '',
      shopEmail: settings?.email ?? '',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
