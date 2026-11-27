/**
 * The 🌐 button on estimate and invoice lines. Browser-side.
 *
 * Flag `ai_translation` OFF (every shop today): exactly the old behaviour —
 * English description → Lao via MyMemory, nothing else.
 *
 * Flag ON (D1 shops only; the server checks again): translates whichever
 * side has text — English → Lao, or Lao → English when the English box is
 * empty — through /api/ai/translate (Grok). If the AI answers nothing (off,
 * over budget, provider down), it falls back to MyMemory the same way.
 */
import { flagRequestHeaders } from '@/lib/featureFlags/requestHeaders';
import { translationDirection, type Lang } from './translation';

/** The old translator, unchanged: returns the input when it fails. */
export async function myMemoryTranslate(text: string, to: Lang): Promise<string> {
  if (!text.trim()) return '';
  const pair = to === 'lo' ? 'en|lo' : 'lo|en';
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
    const data = await res.json();
    return data.responseData?.translatedText || text;
  } catch { return text; }
}

async function aiTranslate(text: string, to: Lang): Promise<string | null> {
  try {
    const res = await fetch('/api/ai/translate', {
      method: 'POST',
      credentials: 'include',
      headers: flagRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text, to }),
    });
    if (!res.ok) return null;
    const body = await res.json() as { text?: string | null };
    return typeof body.text === 'string' && body.text.trim() ? body.text : null;
  } catch { return null; }
}

export interface LineTexts { description: string; laoDescription: string }

/**
 * What to write back into the line, or null for nothing.
 * Returns only the field that was translated into.
 */
export async function translateLineTexts(line: LineTexts, useAi: boolean): Promise<Partial<LineTexts> | null> {
  if (!useAi) {
    if (!line.description) return null;
    return { laoDescription: await myMemoryTranslate(line.description, 'lo') };
  }
  const dir = translationDirection(line.description, line.laoDescription);
  if (!dir) return null;
  const text = (await aiTranslate(dir.from, dir.to)) ?? (await myMemoryTranslate(dir.from, dir.to));
  return dir.to === 'lo' ? { laoDescription: text } : { description: text };
}
