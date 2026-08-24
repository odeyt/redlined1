import 'server-only';

/**
 * AutoPartsAPI as a Redlined1 parts provider.
 *
 * It occupies the existing `catalog` slot rather than adding a registry entry:
 * the OEM cross-reference abstraction already exists, AutoPartsAPI is an
 * implementation of it, and a second entry would mean two places to switch a
 * catalogue on.
 *
 * ## Why search is not wired yet, deliberately
 *
 * Two endpoints are confirmed from the provider dashboard — `/languages/list`
 * and a country lookup. The catalogue/OEM SEARCH endpoint is not, and the
 * brief is explicit that paths must not be assumed beyond current
 * documentation.
 *
 * Guessing one would fail in the most expensive way available: every attempt
 * spends free-tier quota, a 404 is indistinguishable from "no parts found"
 * unless it is classified, and a wrong-but-working path could return a
 * different resource that normalises into plausible parts. So `searchParts`
 * returns nothing and `health()` says exactly what is missing.
 *
 * Everything underneath it — auth, base URL, timeout, error classification,
 * locale resolution, quota protection, normalisation, fitment rules — is
 * built and tested. Wiring the search is one function and one path once the
 * endpoint is documented.
 */
import { logger } from '@/lib/logger';
import { hasCredentials, resolveLocale } from './client';
import type {
  NormalizedPartResult, PartsProvider, PartsSearchInput, ProviderHealth,
} from '../../types';

/**
 * The documented catalogue search path, once known.
 *
 * Left as an environment-supplied value ONLY so the operator can enable it the
 * moment the documentation confirms it, without a code change. It is still
 * validated as a safe relative path by `buildProviderUrl` and can never
 * become an absolute URL or reach another host.
 */
function configuredSearchPath(): string {
  return (process.env.AUTOPARTS_SEARCH_PATH ?? '').trim();
}

export function autoPartsApiHealth(): ProviderHealth {
  if (!hasCredentials()) {
    return {
      id: 'catalog',
      name: 'AutoPartsAPI catalogue',
      enabled: false,
      status: 'missing_credentials',
      reason: 'AUTOPARTS_API_KEY is not configured for this environment.',
    };
  }

  if (!configuredSearchPath()) {
    return {
      id: 'catalog',
      name: 'AutoPartsAPI catalogue',
      enabled: false,
      status: 'disabled_by_config',
      reason:
        'Credentials are present and connectivity can be proven, but the catalogue ' +
        'search endpoint has not been mapped from the provider documentation yet.',
    };
  }

  return { id: 'catalog', name: 'AutoPartsAPI catalogue', enabled: true, status: 'ready' };
}

export const autoPartsApiProvider: PartsProvider = {
  id: 'catalog',
  name: 'AutoPartsAPI catalogue',

  enabled() {
    return autoPartsApiHealth().enabled;
  },

  health: autoPartsApiHealth,

  async searchParts(input: PartsSearchInput): Promise<NormalizedPartResult[]> {
    if (!this.enabled()) return [];

    // Reached only once an endpoint is configured. The locale is resolved from
    // the provider's own reference data (cached for a day) rather than from a
    // hard-coded lang-id.
    try {
      const locale = await resolveLocale();
      logger.info('parts.autopartsapi.locale_resolved', { languageId: locale.languageId });
    } catch {
      logger.warn('parts.autopartsapi.locale_unresolved', {});
      return [];
    }

    // Intentionally not implemented. See the note at the top of this file:
    // the search path is not documented to us, and inventing one spends quota
    // to produce results nobody can trust.
    void input;
    return [];
  },
};
