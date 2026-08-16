/**
 * Get something a person can act on out of an unknown thrown value.
 *
 * `e instanceof Error ? e.message : 'Something failed'` is the pattern all over
 * this codebase, and it discards the useful case. Supabase throws plain
 * objects — `{ message, code, details, hint }` — which are NOT Error
 * instances, so every database failure fell into the generic branch.
 *
 * That is how a payment reported "Payment failed" with no reason while the
 * database was saying something specific, like a permission denial or a
 * missing column. The information existed at every step and was dropped at
 * the last one.
 *
 * Includes the code when there is one: '42501' or 'PGRST204' turns a support
 * conversation from "it failed" into a two-minute fix, and those codes have
 * cost hours here.
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;

  if (e instanceof Error && e.message) return e.message;

  if (typeof e === 'object') {
    const err = e as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const base =
      (typeof err.message === 'string' && err.message) ||
      (typeof err.error_description === 'string' && err.error_description) ||
      (typeof err.details === 'string' && err.details) ||
      '';
    if (base) {
      const code = typeof err.code === 'string' && err.code ? ` (${err.code})` : '';
      // The hint is often the actionable half — Postgres puts "perhaps you
      // meant to reference…" there.
      const hint = typeof err.hint === 'string' && err.hint ? ` — ${err.hint}` : '';
      return `${base}${code}${hint}`;
    }
  }

  return fallback;
}
