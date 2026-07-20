import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireShopRole } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { JobStatusTokenRequestSchema, JobStatusAdvanceSchema } from '@/lib/schemas';
import { isValidTransition, isAfter } from '@/lib/jobStatusTransitions';

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
 *   repair stages is routine frontline-staff work, not owner-only (matches
 *   this route's original, documented design — this hardening pass does not
 *   add new role restrictions beyond what already existed).
 * Resource authorized: `shopId` in the body, resolved to the caller's own
 *   shop_users membership; `jobId` is additionally scoped with
 *   `.eq('shop_id', shopId)` on every query so a caller cannot act on
 *   another shop's job card even if they guessed its id. A cross-shop
 *   jobId therefore always resolves as JOB_NOT_FOUND, never a distinct
 *   "forbidden" — this collapses "doesn't exist" and "not yours" into one
 *   response, deliberately, so a caller cannot enumerate other shops' job
 *   ids by comparing 403 vs 404 (same pattern lib/serverAuth.ts already
 *   uses for shop membership itself).
 * Cross-shop access prevention: requireShopRole() + the shop_id-scoped
 *   job_cards lookup together mean a member of shop A can never read or
 *   advance a job belonging to shop B.
 * Client supplied `shopId` is never trusted as proof of anything — it is
 *   only the key requireShopRole() uses to look up the caller's own
 *   membership row. See lib/serverAuth.ts.
 *
 * STATE MACHINE: the server, not the client, owns which stage transitions
 *   are legal. `stage` in the request body names a *desired* stage, not a
 *   command that's trusted at face value — see lib/jobStatusTransitions.ts.
 *   Only the single immediate-next stage (per REPAIR_STAGE_ORDER) from the
 *   job's actual current stage is ever accepted; skip-ahead, backward, and
 *   same-stage-as-a-new-transition are all rejected with
 *   INVALID_JOB_TRANSITION.
 *
 * IDEMPOTENCY: a request whose target stage exactly matches the job's
 *   current stage is treated as a successful no-op replay (double-tap, slow
 *   network causing a client retry, or a dropped response being resent) —
 *   it returns the same success shape without appending a second history
 *   entry or writing a second audit row. A genuine race between two
 *   concurrent, different-outcome requests is resolved with an atomic
 *   compare-and-swap UPDATE keyed on the stage value read moments earlier;
 *   the request that loses the race is reconciled (success if the winner
 *   reached the same target, JOB_ALREADY_UPDATED / CONFLICT otherwise), and
 *   under no circumstance can a job_cards row be advanced twice for one
 *   logical transition.
 *
 * AUDIT LOG: every successful transition writes one row to
 *   job_status_transitions (old stage, new stage, user id, shop id,
 *   timestamp, request id — see supabase/migrations/job_status_audit_log.sql,
 *   drafted but NOT yet applied to production). Never logs VIN, customer
 *   name, or any other PII — job_cards.id is an opaque `JC-<timestamp>`
 *   string, not a VIN. The insert is best-effort: a failure there (e.g. the
 *   migration not yet applied in a given environment) is logged
 *   server-side via sanitizeError and never blocks or reverses the actual
 *   state transition, which has already committed by the time this runs.
 *
 * ERROR CONTRACT: every response from this route (success or failure) is
 *   JSON. Every failure is `{ code, message, retryable }` — see ErrorCode
 *   below — and never echoes a raw Postgres/Supabase error, stack trace, or
 *   SQL back to the client (sanitizeError() is the only thing allowed to
 *   see the real error, and only for a server-side console.error).
 */
const STAGES = [
  { id: 'checked_in',    label: 'Checked In',       icon: '📋' },
  { id: 'inspecting',    label: 'Being Inspected',   icon: '🔍' },
  { id: 'waiting_parts', label: 'Waiting for Parts', icon: '📦' },
  { id: 'in_repair',     label: 'In Repair',         icon: '🔧' },
  { id: 'quality_check', label: 'Quality Check',     icon: '✅' },
  { id: 'ready',         label: 'Ready for Pickup',  icon: '🎉' },
];

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHENTICATED'
  | 'NOT_MEMBER_OF_SHOP'
  | 'ROLE_NOT_ALLOWED'
  | 'JOB_NOT_FOUND'
  | 'INVALID_JOB_TRANSITION'
  | 'JOB_ALREADY_UPDATED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

function structuredError(code: ErrorCode, message: string, status: number, retryable: boolean): NextResponse {
  return NextResponse.json({ code, message, retryable }, { status });
}

/**
 * Translates requireShopRole()'s generic {error: string} failure response
 * into this route's structured error contract, without changing
 * lib/serverAuth.ts itself (that helper is shared by several other routes
 * with their own existing error shape/tests — this route's hardening stays
 * scoped to app/api/job-status, per this task's instructions). Status code
 * is the only signal used, deliberately, rather than parsing the response
 * body's message text.
 */
function authFailureToStructured(response: NextResponse): NextResponse {
  if (response.status === 400) return structuredError('INVALID_REQUEST', 'Missing or invalid shop.', 400, false);
  if (response.status === 401) return structuredError('UNAUTHENTICATED', 'You must be signed in to do this.', 401, false);
  // requireShopRole's only other failure status is 403, for either
  // "not a member" or "insufficient role" — this route calls it with the
  // default (all 4 roles) allowedRoles, so in practice a 403 here can only
  // mean "not a member of this shop". ROLE_NOT_ALLOWED is defined for
  // forward-compatibility if a future change narrows allowedRoles for a
  // specific transition, but is not reachable today.
  return structuredError('NOT_MEMBER_OF_SHOP', 'You are not authorized for this shop.', 403, false);
}

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

type SupabaseAdmin = ReturnType<typeof createServerSupabase>;

/** Best-effort audit write — never allowed to fail the request or throw past this function. */
async function recordTransition(
  admin: SupabaseAdmin,
  params: { jobId: string; shopId: string; userId: string; fromStage: string; toStage: string; requestId: string },
): Promise<void> {
  try {
    const { error } = await admin.from('job_status_transitions').insert({
      job_id: params.jobId,
      shop_id: params.shopId,
      user_id: params.userId,
      from_stage: params.fromStage,
      to_stage: params.toStage,
      request_id: params.requestId,
    });
    if (error) sanitizeError(error, 'job-status:audit-log');
  } catch (e) {
    sanitizeError(e, 'job-status:audit-log');
  }
}

// PUT — generate or return existing status token for a job card (shop auth required)
export async function PUT(req: NextRequest) {
  const parsed = await parseJsonBody(req, JobStatusTokenRequestSchema);
  if (!parsed.ok) return structuredError('INVALID_REQUEST', 'Invalid request data.', 400, false);
  const { jobId, shopId } = parsed.data;

  const auth = await requireShopRole(req, shopId);
  if (!auth.ok) return authFailureToStructured(auth.response);

  const admin = createServerSupabase();
  const { data: job, error } = await admin
    .from('job_cards').select('id, status_token, repair_stage, stage_history')
    .eq('id', jobId).eq('shop_id', shopId).maybeSingle();
  if (error) {
    sanitizeError(error, 'job-status:PUT lookup');
    return structuredError('INTERNAL_ERROR', 'Unable to load job.', 500, true);
  }
  if (!job) return structuredError('JOB_NOT_FOUND', 'Job not found.', 404, false);

  if (job.status_token) return NextResponse.json({ token: job.status_token, stage: job.repair_stage, history: job.stage_history ?? [] });

  const token = generateToken();
  const history = [{ stage: 'checked_in', label: 'Checked In', icon: '📋', advancedAt: new Date().toISOString(), notifiedSms: false, notifiedEmail: false }];
  const { error: updateError } = await admin
    .from('job_cards')
    .update({ status_token: token, repair_stage: 'checked_in', stage_history: history })
    .eq('id', jobId).eq('shop_id', shopId);
  if (updateError) {
    sanitizeError(updateError, 'job-status:PUT update');
    return structuredError('INTERNAL_ERROR', 'Unable to generate tracking link.', 500, true);
  }

  return NextResponse.json({ token, stage: 'checked_in', history });
}

// POST — advance to next stage (shop auth required)
export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, JobStatusAdvanceSchema);
  if (!parsed.ok) return structuredError('INVALID_REQUEST', 'Invalid request data.', 400, false);
  const { jobId, shopId, stage: targetStage } = parsed.data;

  const auth = await requireShopRole(req, shopId);
  if (!auth.ok) return authFailureToStructured(auth.response);
  const { userId } = auth.context;

  const admin = createServerSupabase();

  // Shop-validation chain: authenticated (above) → membership (above) →
  // job belongs to this shop (this scoped read) → role (above, trivially
  // satisfied by requireShopRole's allowedRoles) → allowed transition
  // (below) → perform update (further below).
  const { data: job, error: readError } = await admin
    .from('job_cards')
    .select('id, repair_stage, stage_history')
    .eq('id', jobId).eq('shop_id', shopId).maybeSingle();
  if (readError) {
    sanitizeError(readError, 'job-status:POST lookup');
    return structuredError('INTERNAL_ERROR', 'Unable to load job.', 500, true);
  }
  if (!job) return structuredError('JOB_NOT_FOUND', 'Job not found.', 404, false);

  const currentStage = (job.repair_stage as string) || 'checked_in';

  // Idempotent replay / duplicate submission: the requested end-state was
  // already reached. Return the same success shape the original call
  // would have returned — never append a second history entry or audit row.
  if (currentStage === targetStage) {
    return NextResponse.json({ ok: true, stage: currentStage, history: job.stage_history ?? [] });
  }

  // Server owns the state machine. The client's requested stage is never
  // trusted just because it's a real stage id — it must be the single
  // immediate next step from the job's actual current stage.
  if (!isValidTransition(currentStage, targetStage)) {
    return structuredError('INVALID_JOB_TRANSITION', `Cannot move from "${currentStage}" to "${targetStage}".`, 400, false);
  }

  const stageInfo = STAGES.find(s => s.id === targetStage)!;
  const requestId = randomUUID();
  const historyEntry = {
    stage: targetStage, label: stageInfo.label, icon: stageInfo.icon,
    advancedAt: new Date().toISOString(),
    notifiedSms: false,
    notifiedEmail: false,
  };
  const nextHistory = [...(job.stage_history ?? []), historyEntry];

  // Atomic compare-and-swap: the update only matches if repair_stage is
  // still exactly the value just read above. This closes the race window
  // between that read and this write — two near-simultaneous requests
  // (double-tap, network replay) can both pass every check above, but only
  // one CAS can ever match a row; the other sees zero rows affected and is
  // reconciled below without ever double-advancing the job.
  const { data: updated, error: updateError } = await admin
    .from('job_cards')
    .update({ repair_stage: targetStage, stage_history: nextHistory })
    .eq('id', jobId)
    .eq('shop_id', shopId)
    .eq('repair_stage', currentStage)
    .select('id, repair_stage, stage_history')
    .maybeSingle();

  if (updateError) {
    sanitizeError(updateError, 'job-status:POST update');
    return structuredError('INTERNAL_ERROR', 'Unable to update job status.', 500, true);
  }

  if (!updated) {
    // Lost the race against a concurrent request — find out what actually
    // landed rather than assuming failure.
    const { data: current, error: recheckError } = await admin
      .from('job_cards').select('repair_stage, stage_history').eq('id', jobId).eq('shop_id', shopId).maybeSingle();
    if (recheckError || !current) {
      if (recheckError) sanitizeError(recheckError, 'job-status:POST recheck');
      return structuredError('CONFLICT', 'Job status changed while processing this request.', 409, true);
    }
    const actualStage = (current.repair_stage as string) || 'checked_in';
    if (actualStage === targetStage) {
      // A concurrent identical request won the race and reached the same
      // target we wanted — that's success, not failure.
      return NextResponse.json({ ok: true, stage: actualStage, history: current.stage_history ?? [] });
    }
    if (isAfter(actualStage, targetStage)) {
      return structuredError('JOB_ALREADY_UPDATED', 'This job has already moved past the requested stage.', 409, false);
    }
    return structuredError('CONFLICT', 'Job status changed while processing this request.', 409, true);
  }

  await recordTransition(admin, { jobId, shopId, userId, fromStage: currentStage, toStage: targetStage, requestId });

  return NextResponse.json({ ok: true, stage: updated.repair_stage, history: updated.stage_history ?? [] });
}

// GET — public fetch by token (no auth)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return structuredError('INVALID_REQUEST', 'Missing token.', 400, false);

  const admin = createServerSupabase();
  const { data: job, error } = await admin
    .from('job_cards').select('id, customer, vehicle, service_type, repair_stage, stage_history, shop_id, check_in_date')
    .eq('status_token', token).maybeSingle();
  if (error) {
    sanitizeError(error, 'job-status:GET lookup');
    return structuredError('INTERNAL_ERROR', 'Unable to load status.', 500, true);
  }
  if (!job) return structuredError('JOB_NOT_FOUND', 'Not found.', 404, false);

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
    shopLogoUrl: settings?.logo_url ?? '',
    shopEmail: settings?.email ?? '',
  });
}
