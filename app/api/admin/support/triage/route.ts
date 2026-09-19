/**
 * POST /api/admin/support/triage   { ticketId, triage }
 * Platform-owner only. Marks a support ticket real, test or spam (or clears the
 * marking with 'unreviewed') by APPENDING one attributed row to
 * support_ticket_triage_events — see supabase/migrations/2026-09-19_support_ticket_triage.sql.
 *
 * What this route will not do:
 *  - it never modifies, hides or deletes a ticket or its messages; it does not even
 *    write to support_tickets. Marking a ticket only changes how the owner portal
 *    counts it;
 *  - it never edits or removes an earlier marking (the table has no UPDATE/DELETE
 *    grant), so the history of who marked what and when is permanent;
 *  - it accepts nothing but a known ticket id and one of the four allowed values.
 *
 * Until the migration is applied the marker table does not exist and this returns
 * 503 "not available"; nothing else is affected.
 *
 * Authorization is server-side and first: the owner check runs before the body is
 * read. The JSON content-type requirement means a cross-site HTML form (which cannot
 * send that type) cannot trigger a marking with the owner's cookies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getAdminDb } from '@/lib/supabaseServer';
import { TICKET_TRIAGE_VALUES } from '@/lib/admin/supportTriage';
import { sanitizeError } from '@/lib/apiHelpers';

const BodySchema = z.object({
  ticketId: z.string().trim().uuid(),
  triage: z.enum(TICKET_TRIAGE_VALUES),
}).strict();

/** PostgREST / Postgres codes for "that table does not exist (yet)". */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

export async function POST(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!auth.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); // an attributed change needs a named owner

  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { ticketId, triage } = parsed.data;

  try {
    const db = getAdminDb();

    const { data: ticket, error: ticketError } = await db.from('support_tickets').select('id').eq('id', ticketId).maybeSingle();
    if (ticketError) return NextResponse.json({ error: sanitizeError(ticketError, 'admin/support/triage') }, { status: 500 });
    if (!ticket) return NextResponse.json({ error: 'No such ticket' }, { status: 404 });

    // The current marking is the newest row. Re-marking a ticket with what it already
    // has would only add noise to the audit trail.
    const { data: latest, error: latestError } = await db
      .from('support_ticket_triage_events')
      .select('triage')
      .eq('ticket_id', ticketId)
      .order('id', { ascending: false })
      .limit(1);
    if (latestError) {
      if (MISSING_TABLE_CODES.has(String(latestError.code))) {
        return NextResponse.json({ error: 'Ticket marking is not available yet' }, { status: 503 });
      }
      return NextResponse.json({ error: sanitizeError(latestError, 'admin/support/triage') }, { status: 500 });
    }
    const current = latest?.[0]?.triage ?? 'unreviewed';
    if (current === triage) return NextResponse.json({ ok: true, ticketId, triage, changed: false });

    const { error: insertError } = await db
      .from('support_ticket_triage_events')
      .insert({ ticket_id: ticketId, triage, set_by: auth.email });
    if (insertError) return NextResponse.json({ error: sanitizeError(insertError, 'admin/support/triage') }, { status: 500 });

    return NextResponse.json({ ok: true, ticketId, triage, changed: true });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/support/triage') }, { status: 500 });
  }
}
