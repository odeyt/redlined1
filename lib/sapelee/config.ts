/**
 * Phase E Part 1, Part 6 — Sapelee Event SDK config.
 *
 * SAPELEE_EVENTS_URL, SAPELEE_KEY_ID, SAPELEE_API_SECRET are server-only
 * (never NEXT_PUBLIC_*) — they're only ever read in lib/sapelee/flush.ts,
 * which is structurally isolated from client-reachable imports (see
 * lib/sapelee/__tests__/signing-isolation.test.ts). Distinct from the
 * pre-existing intelligence/provider/sapelee/SapeleeClient.ts's
 * SAPELEE_API_URL/SAPELEE_API_KEY/SAPELEE_COMPANY_ID — that connector serves
 * a different, still-disabled purpose with a different auth scheme.
 *
 * The `enabled` flag is deliberately NEXT_PUBLIC_ — publishSapeleeEvent()
 * (lib/sapelee/publish.ts) runs in the browser at every real call site
 * (job card, estimate, invoice, etc. — all client components using the
 * browser Supabase client). Next.js only inlines NEXT_PUBLIC_* vars into
 * client bundles; a plain SAPELEE_EVENTS_ENABLED would read as `undefined`
 * in browser code regardless of what's set on the server, silently no-op'ing
 * every client-side publish call for the wrong reason. A boolean feature
 * flag has no secret material in it, unlike the three vars above, so
 * exposing it to the client bundle is safe.
 *
 * Safe-by-default either way: must be explicitly 'true' for any outbound
 * event to ever leave this app, matching Sapelee's own
 * AUTO_EXECUTE_ENABLED/AUTONOMY_DRY_RUN safe-default philosophy on the other
 * side of this integration. Unset or any other value means disabled.
 */

export interface SapeleeEventsConfig {
  enabled: boolean
  eventsUrl: string
  keyId: string
  apiSecret: string
  configured: boolean
}

export function getSapeleeEventsConfig(): SapeleeEventsConfig {
  const enabled = process.env.NEXT_PUBLIC_SAPELEE_EVENTS_ENABLED === 'true'
  const eventsUrl = process.env.SAPELEE_EVENTS_URL ?? ''
  const keyId = process.env.SAPELEE_KEY_ID ?? ''
  const apiSecret = process.env.SAPELEE_API_SECRET ?? ''
  const configured = !!(eventsUrl && keyId && apiSecret)
  return { enabled, eventsUrl, keyId, apiSecret, configured }
}
