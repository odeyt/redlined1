import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabaseServer'
import { flushSapeleeOutbox } from '@/lib/sapelee/flush'

/**
 * Phase E Part 1, Part 7 — triggers one flush pass of the offline queue.
 * Server-side only (uses the service-role client, same as
 * migration_observability_logs.sql's service-role write policy expects).
 * No auth check beyond "this is a server route" — matching this repo's own
 * existing pattern for its internal maintenance scripts (backfill/rebuild),
 * none of which are session-gated either. If this needs external-cron
 * triggering later, add a shared-secret header check then, matching
 * Sapelee's own CRON_SECRET pattern — not fabricated now since no scheduler
 * exists yet to call it.
 */
export async function POST() {
  const db = getAdminDb()
  const result = await flushSapeleeOutbox(db)
  return NextResponse.json(result)
}
