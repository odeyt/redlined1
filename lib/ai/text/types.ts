/**
 * Provider-neutral text model interface.
 *
 * RedlineD1 must never hard-depend on one AI vendor (CLAUDE.md, hard
 * constraint 3). Every product feature that needs a language model asks for
 * a `TextModelProvider` from ./providerFactory and never imports a vendor
 * adapter directly. Switching from Grok to Hermes or Anthropic is then one
 * environment variable plus one adapter file, with no feature code changes.
 *
 * Adapters never throw: any failure (no key, timeout, non-200, empty reply)
 * comes back as `null`, and the feature falls back to its non-AI behaviour.
 */

export interface TextRequest {
  /** Instructions for the model. */
  system: string;
  /** The only user content sent to the provider. */
  user: string;
  /** Hard ceiling on the reply. Keep small: it bounds the cost of a call. */
  maxOutputTokens: number;
}

export interface TextResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * What the provider says the call cost, in USD, when it reports one.
   * Null when it does not; the caller then estimates from tokens.
   */
  reportedCostUsd: number | null;
}

export interface TextModelProvider {
  /** Short id stored with each usage row: 'xai', 'openrouter', 'anthropic', … */
  readonly id: string;
  readonly model: string;
  /** USD per million tokens, used when the provider reports no cost. */
  readonly pricePerMTok: { input: number; output: number };
  complete(req: TextRequest): Promise<TextResult | null>;
}
