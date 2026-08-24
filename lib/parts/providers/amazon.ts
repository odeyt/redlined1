import 'server-only';

/**
 * Amazon — adapter shape only. Deliberately not implemented.
 *
 * The brief says scaffold unless credentials AND eligibility already exist.
 * Neither does: no Amazon variables are configured, and API access is gated on
 * an approved Associates/Creators account, which is an account decision rather
 * than a code one.
 *
 * ## Why there is no request code here
 *
 * Writing a signed request against an API this account cannot call yet would
 * produce code nobody can run and nobody can test — it would be verified by
 * reading, which is the failure mode this codebase keeps hitting. The contract
 * is fixed (a `PartsProvider` returning `NormalizedPartResult[]`), so when
 * access exists the work is this file and nothing else: the registry, the API
 * route, the ranking and the UI already treat Amazon as a first-class source.
 *
 * PA-API 5 is deliberately not used. It is the older programme and building
 * new code onto it now would mean migrating again; this repo has no existing
 * PA-API dependency that would justify it.
 */
import type {
  NormalizedPartResult, PartsProvider, PartsSearchInput, ProviderHealth,
} from '../types';

function creds() {
  return {
    apiKey: process.env.AMAZON_CREATORS_API_KEY ?? '',
    apiSecret: process.env.AMAZON_CREATORS_API_SECRET ?? '',
    partnerTag: process.env.AMAZON_PARTNER_TAG ?? '',
    marketplace: process.env.AMAZON_MARKETPLACE ?? '',
  };
}

export function amazonHealth(): ProviderHealth {
  const { apiKey, apiSecret, partnerTag } = creds();
  const configured = Boolean(apiKey && apiSecret && partnerTag);

  return {
    id: 'amazon',
    name: 'Amazon',
    enabled: false,
    status: configured ? 'disabled_by_config' : 'missing_credentials',
    reason: configured
      // Credentials alone are not access. Saying "ready" here on the strength
      // of three environment variables would be claiming an integration that
      // has never returned a result.
      ? 'Amazon credentials are present but the adapter is not implemented; ' +
        'Creators API eligibility has not been confirmed for this account.'
      : 'Amazon Creators API credentials/eligibility not configured',
  };
}

export const amazonProvider: PartsProvider = {
  id: 'amazon',
  name: 'Amazon',

  enabled() {
    return false;
  },

  health: amazonHealth,

  async searchParts(_input: PartsSearchInput): Promise<NormalizedPartResult[]> {
    // Empty, never sample data. A disabled provider that returns plausible
    // rows is how a fabricated price reaches a customer's estimate.
    void _input;
    return [];
  },
};
