// IntelligenceProviderFactory — selects provider from INTELLIGENCE_PROVIDER env var.
// Defaults to mock. Never crashes if provider is missing or misconfigured.
import type { IntelligenceProvider } from '../types';
import { MockIntelligenceProvider } from '../mock/MockIntelligenceProvider';
import { setPublishFn } from '../events/EventPublisher';

let _instance: IntelligenceProvider | null = null;

function createProvider(): IntelligenceProvider {
  const key = (process.env.INTELLIGENCE_PROVIDER ?? 'mock').toLowerCase().trim();

  switch (key) {
    case 'sapelee': {
      // Sapelee requires API URL + key. If missing, fall back to mock safely.
      const configured = !!(process.env.SAPELEE_API_URL && process.env.SAPELEE_API_KEY);
      if (!configured) {
        console.warn('[Intelligence] INTELLIGENCE_PROVIDER=sapelee but SAPELEE_API_URL/SAPELEE_API_KEY missing — falling back to mock.');
        return new MockIntelligenceProvider();
      }
      // Dynamic import keeps sapelee deps tree-shaken when unused
      const { SapeleeIntelligenceProvider } = require('./sapelee/SapeleeIntelligenceProvider') as typeof import('./sapelee/SapeleeIntelligenceProvider');
      return new SapeleeIntelligenceProvider();
    }
    case 'mock':
    default:
      if (key !== 'mock') {
        console.warn(`[Intelligence] Unknown provider "${key}" — falling back to mock.`);
      }
      return new MockIntelligenceProvider();
  }
}

/**
 * Returns the singleton IntelligenceProvider.
 * Call getProvider() everywhere; do not new() providers directly.
 */
export function getProvider(): IntelligenceProvider {
  if (!_instance) {
    _instance = createProvider();
    // Wire the provider's publishEvent into the EventPublisher.
    setPublishFn((event) => _instance!.publishEvent(event));
  }
  return _instance;
}

/** Reset singleton — for tests only. */
export function _resetProvider(): void {
  _instance = null;
}
