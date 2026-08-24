/**
 * Choosing ONE provider vehicle variant — the last and most consequential step.
 *
 * ## Why this usually cannot be automatic, and why that is the right answer
 *
 * Redlined1 records engine on 6 of 114 vehicles and trim on none. So for
 * almost every real vehicle, the only inputs are make, model and year — and a
 * model year routinely covers several modifications with different brakes,
 * different hubs and different calipers.
 *
 * `ambiguous` is therefore the EXPECTED outcome, not a failure to engineer
 * away. The alternative — picking the first candidate so the workflow
 * completes — produces a confident parts list for a car that may not be the
 * one on the ramp.
 *
 * ## Narrowing is subtractive
 *
 * Each piece of evidence removes candidates that CONTRADICT it. A candidate
 * missing the field is never removed: the provider not publishing a
 * displacement is not the provider saying the displacement differs. Absence
 * eliminates nothing.
 */
import type { ModificationCandidate } from './types';

export interface ModificationMatch {
  status: 'matched' | 'ambiguous' | 'insufficient_data' | 'no_match';
  modification?: ModificationCandidate;
  /** Shown in the variant selector when the technician has to choose. */
  candidates?: ModificationCandidate[];
  detail: string;
}

/**
 * Litres from whatever a shop typed.
 *
 * "3.5L V6" -> 3.5, "1796cc" -> 1.8, "2.0 TDI" -> 2.0. Returns undefined
 * rather than guessing when nothing looks like a displacement.
 */
export function parseDisplacementL(raw: unknown): number | undefined {
  const s = String(raw ?? '').toLowerCase();

  const cc = s.match(/(\d{3,4})\s*cc/);
  if (cc) return Math.round(Number(cc[1]) / 100) / 10;

  const litres = s.match(/(\d)[.,](\d)\s*l?\b/);
  if (litres) return Number(`${litres[1]}.${litres[2]}`);

  const bare = s.match(/\b(\d)[.,](\d)\b/);
  if (bare) return Number(`${bare[1]}.${bare[2]}`);

  return undefined;
}

/** Cylinder count from free text: "3.5L V6" -> 6, "4-cylinder" -> 4. */
export function parseCylinders(raw: unknown): number | undefined {
  const s = String(raw ?? '').toLowerCase();
  const v = s.match(/\bv(\d{1,2})\b/);
  if (v) return Number(v[1]);
  const cyl = s.match(/(\d{1,2})\s*[- ]?cyl/);
  if (cyl) return Number(cyl[1]);
  const i = s.match(/\bi(\d)\b/);
  if (i) return Number(i[1]);
  return undefined;
}

/** Two displacements that mean the same engine. 1796cc is "1.8". */
function displacementAgrees(a?: number, b?: number): boolean {
  if (a === undefined || b === undefined) return true;   // absence eliminates nothing
  return Math.abs(a - b) < 0.15;
}

function textAgrees(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a));
}

export interface ModificationEvidence {
  year?: number;
  /** Free text as the shop typed it — "3.5L V6", "5.5L 8-cyl". */
  engine?: string;
  engineCode?: string;
  fuelType?: string;
  transmission?: string;
}

/**
 * Narrow provider variants using whatever Redlined1 holds.
 *
 * Returns `matched` only when exactly one candidate survives AND at least one
 * piece of engine-level evidence did the narrowing. One survivor reached by
 * year alone is not a resolution — it is a model series that happens to have
 * a single listed variant, and treating it as confirmed would quietly promote
 * a guess.
 */
export function matchModification(
  evidence: ModificationEvidence,
  candidates: ModificationCandidate[],
): ModificationMatch {
  if (!candidates.length) {
    return { status: 'no_match', detail: 'The catalogue lists no variants for this model series.' };
  }

  let pool = candidates;
  const usedEngineEvidence: string[] = [];

  if (evidence.year) {
    pool = pool.filter(c => {
      const from = c.yearFrom ?? -Infinity;
      const to = c.yearTo ?? Infinity;
      return evidence.year! >= from && evidence.year! <= to;
    });
    if (!pool.length) {
      return {
        status: 'no_match',
        detail: `No catalogue variant of this model was in production in ${evidence.year}.`,
      };
    }
  }

  const wantedL = parseDisplacementL(evidence.engine);
  if (wantedL !== undefined) {
    const narrowed = pool.filter(c => displacementAgrees(c.displacementL, wantedL));
    if (narrowed.length) { pool = narrowed; usedEngineEvidence.push(`${wantedL}L`); }
  }

  const wantedCyl = parseCylinders(evidence.engine);
  if (wantedCyl !== undefined) {
    // The provider publishes `numberOfCylinders` directly, so it is read
    // rather than parsed out of the description. Falls back to the
    // description only where the field is absent — and a candidate with
    // neither is not eliminated, because absence eliminates nothing.
    const narrowed = pool.filter(c => {
      const has = c.cylinders ?? parseCylinders(c.description);
      return has === undefined || has === wantedCyl;
    });
    if (narrowed.length) { pool = narrowed; usedEngineEvidence.push(`${wantedCyl} cylinders`); }
  }

  if (evidence.engineCode) {
    const narrowed = pool.filter(c => textAgrees(c.engineCode, evidence.engineCode));
    if (narrowed.length) { pool = narrowed; usedEngineEvidence.push(`engine code ${evidence.engineCode}`); }
  }

  if (evidence.fuelType) {
    const narrowed = pool.filter(c => textAgrees(c.fuel, evidence.fuelType));
    if (narrowed.length) { pool = narrowed; usedEngineEvidence.push(evidence.fuelType); }
  }

  if (evidence.transmission) {
    const narrowed = pool.filter(c => textAgrees(c.transmission, evidence.transmission));
    if (narrowed.length) { pool = narrowed; usedEngineEvidence.push(evidence.transmission); }
  }

  if (pool.length === 1 && usedEngineEvidence.length) {
    return {
      status: 'matched',
      modification: pool[0],
      detail: `Resolved to "${pool[0].description}" using ${usedEngineEvidence.join(', ')}.`,
    };
  }

  if (pool.length === 1) {
    // Exactly one variant, but nothing about the engine chose it. The
    // catalogue simply lists one — plausible, and not the same as confirmed.
    return {
      status: 'ambiguous',
      candidates: pool,
      detail: 'One catalogue variant matches the year, but no engine detail is '
        + 'recorded to confirm it. Confirm the variant to check fitment.',
    };
  }

  if (!usedEngineEvidence.length) {
    return {
      status: 'insufficient_data',
      candidates: pool,
      detail: `${pool.length} catalogue variants match this vehicle. No engine detail is `
        + 'recorded on this vehicle, so one cannot be chosen automatically.',
    };
  }

  return {
    status: 'ambiguous',
    candidates: pool,
    detail: `${pool.length} catalogue variants still match after ${usedEngineEvidence.join(', ')}.`,
  };
}
