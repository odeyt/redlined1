import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabaseServer'
import { getOutboxMetrics } from '@/lib/sapelee/metrics'

/** GET — pending/delivered/failed outbox counts, for monitoring queue health. */
export async function GET() {
  const db = getAdminDb()
  const metrics = await getOutboxMetrics(db)
  return NextResponse.json(metrics)
}
