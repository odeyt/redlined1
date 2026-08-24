import 'server-only';

/**
 * eBay — the only provider with a real implementation in Phase 1.
 *
 * Official Browse API only. eBay.com is never fetched, parsed or scraped: the
 * HTML is not a supported interface, it changes without notice, and reading
 * fitment out of a rendered page would mean inventing compatibility from
 * markup. Everything here goes through api.ebay.com with an OAuth token.
 *
 * ## Server only
 *
 * `import 'server-only'` makes a client import a BUILD error rather than a
 * runtime leak. The client secret is exchanged for a token here and never
 * crosses to the browser; the browser talks to /api/parts/search instead.
 *
 * ## Disabled is a first-class state
 *
 * With no credentials this provider reports `missing_credentials` and returns
 * nothing. It does not throw, and it absolutely does not return sample data —
 * a fabricated price on a customer's estimate is worse than no result, and a
 * fabricated fitment is worse again.
 */
import { logger } from '@/lib/logger';
import { normalizeEbayResponse, type EbayItemSummary } from '../normalize';
import { hasVehicleContext } from '../fitment';
import type {
  NormalizedPartResult, PartsProvider, PartsSearchInput, ProviderHealth,
} from '../types';

const TOKEN_PATH = '/identity/v1/oauth2/token';
const SEARCH_PATH = '/buy/browse/v1/item_summary/search';
const SCOPE = 'https://api.ebay.com/oauth/api_scope';

/** eBay's own cap is 200; 20 is plenty for a technician comparing options. */
const LIMIT = 20;
const TIMEOUT_MS = 8000;

function creds() {
  return {
    clientId: process.env.EBAY_CLIENT_ID ?? '',
    clientSecret: process.env.EBAY_CLIENT_SECRET ?? '',
    environment: (process.env.EBAY_ENVIRONMENT ?? 'production').toLowerCase(),
    // Enrolment in the eBay Partner Network is separate from API access, so
    // it is a separate variable. Without it we simply do not ask for
    // affiliate URLs rather than sending a malformed header.
    campaignId: process.env.EBAY_CAMPAIGN_ID ?? '',
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
  };
}

function apiBase(environment: string): string {
  return environment === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

export function ebayHealth(): ProviderHealth {
  const { clientId, clientSecret } = creds();
  if (!clientId || !clientSecret) {
    return {
      id: 'ebay',
      name: 'eBay',
      enabled: false,
      status: 'missing_credentials',
      reason: 'eBay API credentials are not configured for this environment.',
    };
  }
  return { id: 'ebay', name: 'eBay', enabled: true, status: 'ready' };
}

// ─── Token ───────────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Client-credentials token, held in memory only.
 *
 * Never written to the database, a cookie, or a log. Refreshed a minute early
 * so a request cannot start with a token that expires mid-flight.
 */
async function getToken(signal: AbortSignal): Promise<string | null> {
  const { clientId, clientSecret, environment } = creds();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(apiBase(environment) + TOKEN_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }).toString(),
    signal,
  });

  if (!res.ok) {
    // Status only. The body of a failed token call can echo credentials back.
    logger.warn('parts.ebay.token_failed', { status: res.status });
    return null;
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 7200) * 1000,
  };
  return cachedToken.value;
}

/** Test seam. Exported so a test can clear state without reaching into module internals. */
export function __resetEbayToken() { cachedToken = null; }

// ─── Compatibility filter ────────────────────────────────────────────────────

/**
 * eBay answers compatibility only when it is told what the vehicle is, and
 * only for categories that carry fitment data. Without these properties every
 * result comes back UNDETERMINED — which our fitment rules then correctly
 * refuse to call verified.
 */
function compatibilityFilter(input: PartsSearchInput): string | null {
  if (!hasVehicleContext(input) || !input.year || !input.make || !input.model) return null;
  const props: string[] = [
    `Year:${input.year}`,
    `Make:${input.make}`,
    `Model:${input.model}`,
  ];
  if (input.trim) props.push(`Trim:${input.trim}`);
  if (input.engine) props.push(`Engine:${input.engine}`);
  return props.join(';');
}

// ─── Provider ────────────────────────────────────────────────────────────────

export const ebayProvider: PartsProvider = {
  id: 'ebay',
  name: 'eBay',

  enabled() {
    return ebayHealth().enabled;
  },

  health: ebayHealth,

  async searchParts(input: PartsSearchInput): Promise<NormalizedPartResult[]> {
    if (!this.enabled()) return [];

    const { environment, campaignId, marketplaceId } = creds();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const token = await getToken(controller.signal);
      if (!token) return [];

      const url = new URL(apiBase(environment) + SEARCH_PATH);
      // The query is bounded upstream by the route's schema; bounded again
      // here so this module is safe called from anywhere.
      url.searchParams.set('q', input.query.slice(0, 200));
      url.searchParams.set('limit', String(LIMIT));

      const compat = compatibilityFilter(input);
      if (compat) url.searchParams.set('compatibility_filter', compat);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
        Accept: 'application/json',
      };
      // Affiliate context only when a campaign genuinely exists. Sending an
      // empty one produces a 400, and inventing one is not ours to invent.
      if (campaignId) {
        headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${campaignId}`;
      }

      const res = await fetch(url.toString(), { headers, signal: controller.signal });

      if (res.status === 429) throw new Error('RATE_LIMITED');
      if (res.status === 401 || res.status === 403) {
        cachedToken = null; // force a fresh token next call
        throw new Error('UNAUTHORIZED');
      }
      if (!res.ok) throw new Error(`HTTP_${res.status}`);

      const payload = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
      return normalizeEbayResponse(payload, input, {
        checkedAt: new Date().toISOString(),
        defaultCurrency: input.currency,
      });
    } finally {
      clearTimeout(timer);
    }
  },
};
