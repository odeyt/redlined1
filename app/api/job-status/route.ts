import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { JobStatusTokenRequestSchema, JobStatusAdvanceSchema } from '@/lib/schemas';
import { signStoredUrl } from '@/lib/storage/signServer';

/**
 * PUT /api/job-status — generate (or fetch) a job's public status-tracking token.
 * POST /api/job-status — advance a job's repair stage.
 * GET /api/job-status — intentionally public: fetch a job's status by its
 *   opaque, unguessable `status_token` (this is the customer-facing repair
 *   tracker link, not shop staff auth — the token itself is the credential,
 *   generated only by an authorized PUT call above).
 *
 * Caller (PUT/POST): must be authenticated via a valid Supabase bearer token
 *   AND a member of the target shop (`shopId`) — any role, since advancing
 *   repair stages is routine frontline-staff work, not owner-only.
 * Resource authorized: `shopId` in the body, resolved to the caller's own
 *   shop_users membership; `jobId` is additionally scoped with
 *   `.eq('shop_id', shopId)` on every query so a caller cannot act on
 *   another shop's job card even if they guessed its id.
 * Treated only as resource identifiers: `jobId`, `shopId`.
 * Cross-shop access prevention: requireShopRole() + the shop_id-scoped
 *   job_cards lookup together mean a member of shop A can never read or
 *   advance a job belonging to shop B.
 */
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
  const parsed = await parseJsonBody(req, JobStatusTokenRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { jobId, shopId } = parsed.data;

  const auth = await requireShopRole(req, shopId);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();
  const { data: job, error } = await admin
    .from('job_cards').select('id, status_token, repair_stage, stage_history')
    .eq('id', jobId).eq('shop_id', shopId).maybeSingle();
  if (error) return NextResponse.json({ error: sanitizeError(error, 'job-status:PUT lookup', 'Unable to load job') }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  if (job.status_token) return NextResponse.json({ token: job.status_token, stage: job.repair_stage, history: job.stage_history ?? [] });

  const token = generateToken();
  const history = [{ stage: 'checked_in', label: 'Checked In', icon: '📋', advancedAt: new Date().toISOString(), notifiedSms: false, notifiedEmail: false }];
  const { error: updateError } = await admin
    .from('job_cards')
    .update({ status_token: token, repair_stage: 'checked_in', stage_history: history })
    .eq('id', jobId);
  if (updateError) return NextResponse.json({ error: sanitizeError(updateError, 'job-status:PUT update', 'Unable to generate tracking link') }, { status: 500 });

  return NextResponse.json({ token, stage: 'checked_in', history });
}

// POST — advance to next stage (shop auth required)
export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, JobStatusAdvanceSchema);
  if (!parsed.ok) return parsed.response;
  const { jobId, shopId, stage } = parsed.data;

  const auth = await requireShopRole(req, shopId);
  if (!auth.ok) return auth.response;

  const stageInfo = STAGES.find(s => s.id === stage)!;

  const admin = createServerSupabase();
  const { data: job, error } = await admin
    .from('job_cards').select('id, stage_history').eq('id', jobId).eq('shop_id', shopId).maybeSingle();
  if (error) return NextResponse.json({ error: sanitizeError(error, 'job-status:POST lookup', 'Unable to load job') }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const history = [...(job.stage_history ?? []), {
    stage, label: stageInfo.label, icon: stageInfo.icon,
    advancedAt: new Date().toISOString(),
    notifiedSms: false,
    notifiedEmail: false,
  }];

  const { error: updateError } = await admin
    .from('job_cards').update({ repair_stage: stage, stage_history: history }).eq('id', jobId);
  if (updateError) return NextResponse.json({ error: sanitizeError(updateError, 'job-status:POST update', 'Unable to update job status') }, { status: 500 });

  return NextResponse.json({ ok: true, stage, history });
}

// GET — public fetch by token (no auth)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = createServerSupabase();
  const { data: job, error } = await admin
    .from('job_cards').select('id, customer, vehicle, service_type, repair_stage, stage_history, shop_id, check_in_date')
    .eq('status_token', token).maybeSingle();
  if (error) return NextResponse.json({ error: sanitizeError(error, 'job-status:GET lookup', 'Unable to load status') }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: shop } = await admin.from('shops').select('name').eq('id', job.shop_id).maybeSingle();
  const { data: settings } = await admin.from('shop_settings').select('phone, address, logo_url, email').eq('shop_id', job.shop_id).maybeSingle();

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
    // Signed for the same reason as the inspection report: the customer
    // tracking their job has no session to sign with. Only the logo here.
    shopLogoUrl: await signStoredUrl(settings?.logo_url),
    shopEmail: settings?.email ?? '',
  });
}
