import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase E Part 1, Part 10 — offline queue depth monitoring. Server-only
 * (needs the service-role client to read across the whole outbox,
 * bypassing the shop-scoped RLS insert policy from
 * migration_sapelee_event_outbox.sql).
 */
export interface SapeleeOutboxMetrics {
  pending: number
  delivered: number
  failed: number
  oldestPendingAgeSeconds: number | null
}

export async function getOutboxMetrics(supabase: SupabaseClient): Promise<SapeleeOutboxMetrics> {
  const [pending, delivered, failed, oldestPending] = await Promise.all([
    supabase.from('sapelee_event_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('sapelee_event_outbox').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
    supabase.from('sapelee_event_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase
      .from('sapelee_event_outbox')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const oldest = oldestPending.data as { created_at: string } | null
  const oldestPendingAgeSeconds = oldest
    ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 1000)
    : null

  return {
    pending: pending.count ?? 0,
    delivered: delivered.count ?? 0,
    failed: failed.count ?? 0,
    oldestPendingAgeSeconds,
  }
}
