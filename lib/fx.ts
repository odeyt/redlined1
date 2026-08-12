/**
 * Daily exchange rates, shared.
 *
 * InvoicesView and EstimatesView each carried their own copy of this, with a
 * per-component cache, so the same rate was fetched repeatedly and the two
 * could disagree within one session.
 *
 * The important difference from those copies: on failure they returned 1.
 * A rate of 1 between LAK and THB turns a 600,000 LAK deposit into 600,000
 * THB — roughly a 25x error, silently, on a customer's balance. This returns
 * null instead and makes the caller decide what to show. A missing rate is a
 * question for a human, never a default.
 */

/** from -> to -> rate, for this page session. */
const cache = new Map<string, Map<string, number>>();

/** In-flight requests, so N components asking at once make one call. */
const inFlight = new Map<string, Promise<Map<string, number> | null>>();

async function ratesFor(from: string): Promise<Map<string, number> | null> {
  const key = from.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${key}.json`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data?.[key];
      if (!raw || typeof raw !== 'object') return null;
      const map = new Map<string, number>(
        Object.entries(raw as Record<string, number>).map(([k, v]) => [k.toLowerCase(), Number(v)]),
      );
      cache.set(key, map);
      return map;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

/**
 * Today's rate, or null when it cannot be determined.
 *
 * Null means "do not convert" — not "convert at 1".
 */
export async function getExchangeRate(from: string, to: string): Promise<number | null> {
  if (!from || !to) return null;
  if (from.toLowerCase() === to.toLowerCase()) return 1;

  const rates = await ratesFor(from);
  const rate = rates?.get(to.toLowerCase());
  return typeof rate === 'number' && isFinite(rate) && rate > 0 ? rate : null;
}

/** Converts an amount, or returns null when no rate is available. */
export async function convertAmount(
  amount: number, from: string, to: string,
): Promise<number | null> {
  const rate = await getExchangeRate(from, to);
  if (rate === null) return null;
  return amount * rate;
}

/** Test seam — rates are per session and must not leak between tests. */
export function clearFxCache(): void {
  cache.clear();
  inFlight.clear();
}
