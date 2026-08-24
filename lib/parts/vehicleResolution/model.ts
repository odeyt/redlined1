/**
 * Matching Redlined1's `model` to a provider model series.
 *
 * Harder than the manufacturer, because model names are not a controlled
 * vocabulary. A catalogue writes "C-CLASS (W205)" and a service advisor typed
 * "C 200". They are not the same string and they are not meant to be.
 *
 * ## The rule
 *
 * Token containment after normalisation, ANCHORED at the start, plus a
 * production-year window when the provider gives one. Never a similarity
 * score: on model names, similarity is how "C 200" matches "C-MAX", and the
 * consequence is a parts list for a different car.
 *
 * A bare letter is refused outright. The brief's own example — a model must
 * not be selected merely because "C" appears in the description — is exactly
 * the failure a containment rule invites, so a token has to be at least two
 * characters or carry a digit before it may match anything.
 */

export interface ProviderModel {
  id: number;
  name: string;
  yearFrom?: number;
  yearTo?: number;
}

export interface ModelMatch {
  status: 'matched' | 'ambiguous' | 'no_match' | 'missing_input';
  model?: ProviderModel;
  candidates?: ProviderModel[];
  detail: string;
}

/** Lower-cased, punctuation to spaces, collapsed. "C-CLASS (W205)" -> tokens. */
export function modelTokens(raw: unknown): string[] {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * A token substantial enough to base a match on.
 *
 * "c" is not. "c200", "class", "205" are. Without this, every Mercedes model
 * matches every other one through the shared letter.
 */
function significant(token: string): boolean {
  return token.length >= 2 || /\d/.test(token);
}

/**
 * Does the provider's model name cover what the shop typed?
 *
 * Every significant token from the shop's model must appear in the provider's
 * name. "C 200" against "C-CLASS (W205)" fails on `200`, which is correct —
 * C 200 is a variant of C-Class, and matching it to the series is the job of
 * the MODIFICATION step, not this one. What this must catch is "C-Class"
 * against "C-CLASS (W205)".
 */
export function modelNameCovers(providerName: string, shopModel: string): boolean {
  const want = modelTokens(shopModel);
  if (!want.length) return false;

  // At least one token must be substantial, or the query is a bare letter and
  // would match half the catalogue. "C" is refused; "C-Class" is not.
  if (!want.some(significant)) return false;

  // EVERY token must be present, including the short ones. Dropping them
  // instead — an earlier version of this function did — makes "S-Class" match
  // "C-CLASS", because both reduce to the single token "class".
  const have = new Set(modelTokens(providerName));
  return want.every(t => have.has(t));
}

/** Whether a year falls in a provider production window, when one is given. */
export function yearInWindow(model: ProviderModel, year?: number): boolean {
  if (!year) return true;                       // nothing to contradict
  if (model.yearFrom === undefined && model.yearTo === undefined) return true;
  const from = model.yearFrom ?? -Infinity;
  const to = model.yearTo ?? Infinity;
  return year >= from && year <= to;
}

/**
 * Pick the provider model series.
 *
 * The year is used to NARROW, never to match on its own — a model list for one
 * manufacturer contains dozens of series that were all in production in 2014.
 */
export function matchModel(
  shopModel: unknown,
  year: number | undefined,
  provider: ProviderModel[],
): ModelMatch {
  const wanted = String(shopModel ?? '').trim();
  if (!wanted) {
    return { status: 'missing_input', detail: 'The vehicle has no model recorded.' };
  }

  let byName = provider.filter(m => modelNameCovers(m.name, wanted));

  // ── Designations ─────────────────────────────────────────────────────────
  //
  // Redlined1 stores what is written on the car. For a Mercedes that is
  // usually a DESIGNATION — "C260", "S350" — while the catalogue names the
  // SERIES: "C-CLASS (W206)". They share no token, so a live 2023 C260
  // matched nothing at all against 255 real Mercedes series.
  //
  // A designation decomposes: a letter part naming the class and a number
  // part naming the variant. The letter is matched against the series here;
  // the NUMBER is left for the modification step, where the provider's own
  // descriptions carry "C 260".
  //
  // This deliberately always reports AMBIGUOUS, never `matched`. A single
  // letter must not select a series — "C" fits both C-CLASS and C-MAX — so
  // the surviving series are handed to the technician rather than chosen.
  let viaDesignation = false;
  if (!byName.length) {
    const designation = wanted.trim().match(/^([A-Za-z]{1,3})[\s-]?(\d{2,4})$/);
    if (designation) {
      const classToken = designation[1].toLowerCase();
      byName = provider.filter(m => modelTokens(m.name).includes(classToken));
      viaDesignation = byName.length > 0;
    }
  }

  if (!byName.length) {
    return {
      status: 'no_match',
      detail: `The catalogue lists no model series matching "${wanted}" for this manufacturer.`,
    };
  }

  const byYear = byName.filter(m => yearInWindow(m, year));

  // Every name match was ruled out by the year. Reported as no_match with the
  // year named, because "we found it but not for 2014" is a different problem
  // from "we never found it" and the technician can act on it.
  if (!byYear.length) {
    return {
      status: 'no_match',
      detail: `The catalogue lists "${wanted}" but not in production for ${year}.`,
    };
  }

  // A designation never resolves on its own, even down to one survivor: it
  // matched on a class letter, and a class letter is not a series.
  if (viaDesignation) {
    return {
      status: 'ambiguous',
      candidates: byYear,
      detail: `"${wanted}" is a model designation rather than a catalogue series. `
        + `${byYear.length} series match its class`
        + (year ? ` for ${year}.` : '.'),
    };
  }

  if (byYear.length === 1) {
    return {
      status: 'matched',
      model: byYear[0],
      detail: `Matched "${wanted}" to catalogue series "${byYear[0].name}".`,
    };
  }

  return {
    status: 'ambiguous',
    candidates: byYear,
    detail: `${byYear.length} catalogue series match "${wanted}"`
      + (year ? ` for ${year}.` : '. No year is recorded to narrow them.'),
  };
}
