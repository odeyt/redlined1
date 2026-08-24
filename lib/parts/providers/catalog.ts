import 'server-only';

/**
 * OEM / cross-reference catalogue — interface and disabled adapter.
 *
 * A catalogue provider answers a different question from a marketplace: not
 * "who sells this" but "what part number IS this, and what supersedes it". It
 * is the only thing that can turn an OEM number into an aftermarket
 * equivalent, and therefore the only honest source of a `likely` fitment.
 *
 * No catalogue credentials exist in this environment, so this adapter is off.
 * It is defined now because the fitment model already distinguishes `likely`
 * from `unverified`, and that distinction is meaningless until something can
 * supply a cross-reference. The shape is fixed so the day a catalogue is
 * licensed, nothing above this file changes.
 *
 * `local_supplier` is the same idea pointed at a shop's own price list. Left
 * for a later phase because it needs a data model for supplier pricing, not
 * just an adapter.
 */
import type {
  NormalizedPartResult, PartsProvider, PartsSearchInput, ProviderHealth,
} from '../types';

function creds() {
  return {
    apiKey: process.env.PARTS_CATALOG_API_KEY ?? '',
    baseUrl: process.env.PARTS_CATALOG_BASE_URL ?? '',
  };
}

export function catalogHealth(): ProviderHealth {
  const { apiKey, baseUrl } = creds();
  return {
    id: 'catalog',
    name: 'OEM catalogue',
    enabled: false,
    status: apiKey && baseUrl ? 'disabled_by_config' : 'missing_credentials',
    reason: apiKey && baseUrl
      ? 'Catalogue credentials are present but no licensed adapter is implemented.'
      : 'No OEM catalogue provider is licensed for this environment.',
  };
}

export const catalogProvider: PartsProvider = {
  id: 'catalog',
  name: 'OEM catalogue',
  enabled() { return false; },
  health: catalogHealth,
  async searchParts(_input: PartsSearchInput): Promise<NormalizedPartResult[]> {
    void _input;
    return [];
  },
};
