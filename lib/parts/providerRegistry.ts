import 'server-only';

/**
 * The one place that knows which providers exist.
 *
 * Nothing else may construct a provider or call one directly. That is what
 * keeps "add RockAuto" an honest conversation about authorised access instead
 * of a fetch call someone drops into a component.
 *
 * ## The pending entries are the point
 *
 * RockAuto, PartsGeek, SSG, PartsTech and NAPA appear here as OFF, with a
 * status saying why. None of them publishes a parts API this shop can call,
 * and the only way to "integrate" them today would be scraping — which is
 * unauthorised, breaks silently, and would put invented fitment in front of a
 * technician. Representing them as pending is the accurate answer and it keeps
 * the roadmap visible without pretending.
 */
import { ebayProvider } from './providers/ebay';
import { amazonProvider } from './providers/amazon';
import { catalogProvider } from './providers/catalog';
import type { PartsProvider, PartsProviderId, ProviderHealth } from './types';

/** Providers with an implementation, whether or not they are switched on. */
export const IMPLEMENTED_PROVIDERS: PartsProvider[] = [
  ebayProvider,
  amazonProvider,
  catalogProvider,
];

/**
 * Providers the architecture supports and that have no authorised route in.
 *
 * Kept as data rather than code so nobody has to write a stub adapter to add
 * one — and so the reason travels with the entry.
 */
export const PENDING_PROVIDERS: ProviderHealth[] = [
  {
    id: 'rockauto', name: 'RockAuto', enabled: false, status: 'pending_authorized_access',
    reason: 'No public parts API. Requires an authorised feed or partner agreement.',
  },
  {
    id: 'partsgeek', name: 'PartsGeek', enabled: false, status: 'pending_authorized_access',
    reason: 'No public parts API. Requires an authorised feed or partner agreement.',
  },
  {
    id: 'ssg', name: 'SSG Asia', enabled: false, status: 'pending_authorized_access',
    reason: 'Regional supplier. Requires a supplier data agreement.',
  },
  {
    id: 'partstech', name: 'PartsTech', enabled: false, status: 'future',
    reason: 'Aggregator API. Planned for a later phase, requires a commercial account.',
  },
  {
    id: 'napa', name: 'NAPA', enabled: false, status: 'future',
    reason: 'Requires a NAPA commercial account and authorised API access.',
  },
  {
    id: 'local_supplier', name: 'Local supplier', enabled: false, status: 'future',
    reason: 'Needs a supplier price-list data model before an adapter is meaningful.',
  },
];

export function getProvider(id: PartsProviderId): PartsProvider | undefined {
  return IMPLEMENTED_PROVIDERS.find(p => p.id === id);
}

/** Only providers that will actually be called. */
export function getEnabledProviders(): PartsProvider[] {
  return IMPLEMENTED_PROVIDERS.filter(p => {
    try {
      return p.enabled();
    } catch {
      // A provider whose enabled() throws is treated as off rather than
      // allowed to take down the search for every other provider.
      return false;
    }
  });
}

/** Every provider's state, for the UI's provider strip and for the docs. */
export function getAllProviderHealth(): ProviderHealth[] {
  const implemented = IMPLEMENTED_PROVIDERS.map(p => {
    try {
      return p.health();
    } catch {
      return {
        id: p.id, name: p.name, enabled: false,
        status: 'disabled_by_config' as const,
        reason: 'Provider failed to report its status.',
      };
    }
  });
  return [...implemented, ...PENDING_PROVIDERS];
}

/** True when nothing can be searched — the UI says so instead of spinning. */
export function anyProviderEnabled(): boolean {
  return getEnabledProviders().length > 0;
}
