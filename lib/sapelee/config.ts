/**
 * Phase E Part 1, Part 6 — Sapelee Event SDK config.
 *
 * Server-only env vars (never NEXT_PUBLIC_*): SAPELEE_EVENTS_URL,
 * SAPELEE_KEY_ID, SAPELEE_API_SECRET. Distinct from the pre-existing
 * intelligence/provider/sapelee/SapeleeClient.ts's SAPELEE_API_URL/
 * SAPELEE_API_KEY/SAPELEE_COMPANY_ID — that connector serves a different,
 * still-disabled purpose (anonymized metrics + AI brief enhancement) with a
 * different auth scheme (bearer key + company id, no signing). This SDK is
 * purpose-built for the Event Bus integration's HMAC-signed scheme and is
 * intentionally a separate, non-overlapping config surface.
 *
 * Safe-by-default: SAPELEE_EVENTS_ENABLED must be explicitly 'true' for any
 * outbound event to ever leave this app, matching Sapelee's own
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
  const enabled = process.env.SAPELEE_EVENTS_ENABLED === 'true'
  const eventsUrl = process.env.SAPELEE_EVENTS_URL ?? ''
  const keyId = process.env.SAPELEE_KEY_ID ?? ''
  const apiSecret = process.env.SAPELEE_API_SECRET ?? ''
  const configured = !!(eventsUrl && keyId && apiSecret)
  return { enabled, eventsUrl, keyId, apiSecret, configured }
}
