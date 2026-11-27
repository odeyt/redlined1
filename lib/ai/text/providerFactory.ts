/**
 * Picks the text model provider from the environment. Server-only.
 *
 *   AI_TEXT_PROVIDER = xai | off      (default: xai when XAI_API_KEY is set, else off)
 *   XAI_API_KEY      = the xAI key     (set in Vercel, never in source)
 *   XAI_MODEL        = optional model override
 *
 * Adding Hermes (e.g. via OpenRouter) or Anthropic later means one adapter
 * file and one case below. Feature code only ever calls getTextProvider().
 */
import type { TextModelProvider } from './types';
import { createXaiProvider } from './xaiProvider';

export function getTextProvider(env: NodeJS.ProcessEnv = process.env): TextModelProvider | null {
  const xaiKey = env.XAI_API_KEY?.trim() ?? '';
  const choice = (env.AI_TEXT_PROVIDER?.trim().toLowerCase()) || (xaiKey ? 'xai' : 'off');

  switch (choice) {
    case 'xai':
      return xaiKey ? createXaiProvider(xaiKey, env.XAI_MODEL?.trim() || undefined) : null;
    case 'off':
      return null;
    default:
      console.warn(`[ai] Unknown AI_TEXT_PROVIDER "${choice}" — AI features stay off.`);
      return null;
  }
}
