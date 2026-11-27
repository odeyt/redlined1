/**
 * Estimate drafting from the shop's own history. No AI.
 *
 * Owner decision (2026-11-27): "Past jobs first, no AI". Given the vehicle and
 * the work asked for (the linked job card's service type and notes), find the
 * shop's past estimates for the same make and model with similar work, and
 * suggest their lines at the prices the shop actually charged — each with the
 * estimates it came from, so staff can see why it was suggested.
 *
 * Pure: rows in, suggestions out. The route reads the rows.
 */

export interface PastLine {
  description?: string | null;
  laoDescription?: string | null;
  qty?: number | string | null;
  rate?: number | string | null;
  cost?: number | string | null;
  markup?: number | string | null;
  currency?: string | null;
  note?: string | null;
}

export interface PastEstimate {
  id: string;
  estimate_number?: string | null;
  vehicle?: string | null;
  status?: string | null;
  created_at?: string | null;
  currency?: string | null;
  lines?: PastLine[] | null;
}

export interface DraftQuery {
  vehicle: string;
  /** Service type + notes of the linked job card, or anything typed. May be empty. */
  workText: string;
  /** The estimate being edited, so it never suggests itself. */
  excludeId?: string | null;
}

export interface MatchedEstimate {
  id: string;
  number: string;
  vehicle: string;
  status: string;
  date: string;
  score: number;
}

export interface SuggestedLine {
  description: string;
  laoDescription: string;
  qty: number;
  rate: number;
  cost: number | null;
  markup: number | null;
  currency: string;
  /** Part number, when the past line had one. */
  note: string;
  /** How many of the matched estimates had this line. */
  seenIn: number;
  /** Estimate numbers it came from, most recent first. */
  sources: string[];
}

export interface DraftResult {
  /** Words the match used, for "Matched on: …". */
  vehicleTerms: string[];
  workTerms: string[];
  matches: MatchedEstimate[];
  lines: SuggestedLine[];
}

export const MAX_MATCHES = 8;
export const MAX_LINES = 12;
/**
 * Share of the query's make/model words a past vehicle must contain.
 * 0.6: "Toyota Hilux" needs both words (a Fortuner is not a Hilux);
 * "Toyota Hilux Revo" needs two of three.
 */
export const MIN_VEHICLE_SCORE = 0.6;

const STATUS_WEIGHT: Record<string, number> = {
  Approved: 1, Converted: 1, Sent: 0.8, Pending: 0.8, Draft: 0.6, Declined: 0.4,
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'when', 'what', 'that', 'this', 'not', 'are', 'was', 'has', 'have',
  'see', 'notes', 'note', 'technician', 'tech', 'customer', 'says', 'said', 'check', 'checked', 'please',
  'car', 'vehicle', 'need', 'needs', 'also', 'very', 'some', 'into', 'out', 'off', 'all', 'any',
  'complaint', 'service', 'repair', 'job', 'card', 'general',
]);

const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

/** Plain words: lowercase latin letters, 2+ long, no digits (plates, part numbers). */
function words(text: string): string[] {
  return (text.toLowerCase().replace(VIN, ' ').match(/[a-z]+/g) ?? []).filter(w => w.length >= 2);
}

/** Crude singular, so "pads" meets "pad" and "brakes" meets "brake". */
function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

/** Make/model words of a vehicle label; year, plate, VIN and punctuation dropped. */
export function vehicleTerms(label: string | null | undefined): string[] {
  return [...new Set(words(label ?? ''))];
}

/** Work words from the job card text: 3+ letters, stopwords dropped, singular. */
export function workTerms(text: string | null | undefined): string[] {
  return [...new Set(words(text ?? '').filter(w => w.length >= 3 && !STOPWORDS.has(w)).map(stem))];
}

/** Share of `query` words found in `candidate`. 0 when the query is empty. */
function coverage(query: readonly string[], candidate: ReadonlySet<string>): number {
  if (query.length === 0) return 0;
  return query.filter(q => candidate.has(q)).length / query.length;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Identity of a line across estimates: "Front brake pads." ≡ "front brake pads". */
export function lineKey(description: string): string {
  return description.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function recencyWeight(createdAt: string | null | undefined, now: Date): number {
  if (!createdAt) return 0.8;
  const days = (now.getTime() - new Date(createdAt).getTime()) / 86_400_000;
  return days <= 365 ? 1 : 0.8;
}

/** Score one past estimate against the query. 0 = not a match. */
export function scoreEstimate(est: PastEstimate, vTerms: readonly string[], wTerms: readonly string[], now: Date): number {
  const status = est.status ?? '';
  if (status === 'Void') return 0;
  const vehicleScore = coverage(vTerms, new Set(vehicleTerms(est.vehicle)));
  if (vTerms.length > 0 && vehicleScore < MIN_VEHICLE_SCORE) return 0;

  const lineWords = new Set((est.lines ?? []).flatMap(l => words(l?.description ?? '').map(stem)));
  const workScore = coverage(wTerms, lineWords);
  if (wTerms.length > 0 && workScore === 0) return 0;

  const base = wTerms.length > 0 ? 0.4 * vehicleScore + 0.6 * workScore : vehicleScore;
  const weight = (STATUS_WEIGHT[status] ?? 0.6) * recencyWeight(est.created_at, now);
  return Math.round(base * weight * 1000) / 1000;
}

export function draftFromHistory(query: DraftQuery, estimates: readonly PastEstimate[], now = new Date()): DraftResult {
  const vTerms = vehicleTerms(query.vehicle);
  const wTerms = workTerms(query.workText);
  const empty: DraftResult = { vehicleTerms: vTerms, workTerms: wTerms, matches: [], lines: [] };
  if (vTerms.length === 0 && wTerms.length === 0) return empty;

  const scored = estimates
    .filter(e => e.id !== query.excludeId)
    .map(e => ({ e, score: scoreEstimate(e, vTerms, wTerms, now) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.e.created_at ?? '').localeCompare(a.e.created_at ?? ''))
    .slice(0, MAX_MATCHES);

  const matches: MatchedEstimate[] = scored.map(({ e, score }) => ({
    id: e.id,
    number: e.estimate_number || 'Estimate',
    vehicle: e.vehicle ?? '',
    status: e.status ?? '',
    date: (e.created_at ?? '').slice(0, 10),
    score,
  }));

  // Group lines across the matched estimates; the most recent copy sets the price.
  interface Group { line: SuggestedLine; weight: number; latest: string }
  const groups = new Map<string, Group>();
  const byRecency = [...scored].sort((a, b) => (b.e.created_at ?? '').localeCompare(a.e.created_at ?? ''));
  for (const { e, score } of byRecency) {
    const seenHere = new Set<string>();
    for (const l of e.lines ?? []) {
      const description = (l?.description ?? '').trim();
      const rate = num(l?.rate);
      if (!description || rate == null || rate <= 0) continue;   // blank or placeholder lines
      const key = lineKey(description);
      if (!key || seenHere.has(key)) continue;
      seenHere.add(key);

      const g = groups.get(key);
      const number = e.estimate_number || 'Estimate';
      if (g) {
        g.line.seenIn += 1;
        g.weight += score;
        if (!g.line.sources.includes(number)) g.line.sources.push(number);
        continue;
      }
      groups.set(key, {
        weight: score,
        latest: e.created_at ?? '',
        line: {
          description,
          laoDescription: (l?.laoDescription ?? '').trim(),
          qty: num(l?.qty) && (num(l?.qty) as number) > 0 ? (num(l?.qty) as number) : 1,
          rate,
          cost: num(l?.cost),
          markup: num(l?.markup),
          currency: ((l?.currency || e.currency || 'USD') as string).toUpperCase(),
          note: (l?.note ?? '').trim(),
          seenIn: 1,
          sources: [number],
        },
      });
    }
  }

  const lines = [...groups.values()]
    .sort((a, b) => b.line.seenIn - a.line.seenIn || b.weight - a.weight || b.latest.localeCompare(a.latest))
    .slice(0, MAX_LINES)
    .map(g => g.line);

  return { vehicleTerms: vTerms, workTerms: wTerms, matches, lines };
}
