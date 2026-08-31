/**
 * What the OEM-reference stage is allowed to show, and where selecting one goes.
 *
 * No React Testing Library in this project, so these read source rather than
 * rendered output. The limit is real: they prove the wiring and the wording
 * exist, not that a technician sees them. The screen itself is checked on
 * staging — which is how every bug in this milestone was actually found.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REFS_RAW = readFileSync(
  join(process.cwd(), 'features/estimates/VehicleOemReferences.tsx'), 'utf8');

/**
 * Source with comments stripped.
 *
 * The bans below are about what the component RENDERS. Applied to the raw
 * file they also flag the prose explaining why those things are absent —
 * which failed the first run of this suite and would have pushed me to delete
 * the explanation to make a test pass. The rule is about code, so the
 * assertion reads code.
 */
const REFS = REFS_RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const MODAL = readFileSync(
  join(process.cwd(), 'features/estimates/PartsSearchModal.tsx'), 'utf8');
const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/search/route.ts'), 'utf8');

describe('the reference stage claims only what it has', () => {
  it('names itself a reference stage, not a parts list', () => {
    expect(REFS_RAW).toContain('VEHICLE PART REFERENCES');
    expect(REFS_RAW).toContain('CATALOG VEHICLE REFERENCE');
  });

  it('offers no purchase action', () => {
    // There is no part yet — no brand, no price, no seller.
    expect(REFS).not.toContain('Select this part');
    expect(REFS).not.toContain('Add to Estimate');
  });

  it('shows no price, brand, image or supplier', () => {
    for (const invented of [
      'itemPrice', 'landedCost', 'shippingCost', 'currency',
      '<img', 'imageUrl', 'supplierName', 'brand',
    ]) {
      expect(REFS).not.toContain(invented);
    }
  });

  it('makes no fitment claim of any kind', () => {
    // Specifically not LIKELY FIT, which the previous build did assert.
    for (const verdict of ['LIKELY', 'VERIFIED', 'fitmentStatus', 'FITMENT_LABEL']) {
      expect(REFS).not.toContain(verdict);
    }
  });

  it('says these are not offers and not yet checked for fitment', () => {
    expect(REFS_RAW).toContain('not offers');
    expect(REFS_RAW).toContain('not yet checked for fitment');
  });
});

describe('a long reference list stays usable', () => {
  it('pages rather than dumping every button', () => {
    // One live query returned 186 references under a single name.
    expect(REFS_RAW).toContain('const PAGE = 25');
    expect(REFS_RAW).toContain('Show more');
  });

  it('offers a client-side filter', () => {
    expect(REFS_RAW).toContain('Search OEM references');
  });

  it('always states what is shown against what exists', () => {
    // "Showing 25" with no denominator reads as the whole answer.
    expect(REFS_RAW).toContain('Showing ${page.length} of ${visible.length}');
    expect(REFS_RAW).toContain('filtered from ');
  });

  it('spends no provider call to filter or page', () => {
    // Everything here is local state over data already delivered.
    expect(REFS).not.toContain('fetch(');
    expect(REFS).not.toContain('runSearch');
    expect(REFS_RAW).toContain('useState');
  });

  it('keys buttons on the reference itself', () => {
    expect(REFS_RAW).toContain('key={oem}');
    expect(REFS).not.toContain('key={i}');
    expect(REFS).not.toContain('key={index}');
  });

  it('gives touch targets a usable height', () => {
    // Mobile is the common case in the workshop.
    expect(REFS_RAW).toMatch(/minHeight: 3[0-9]/);
  });
});

describe('selecting a reference runs the canonical OEM search', () => {
  it('invents no new provider workflow', () => {
    // It reuses runSearch in 'oem' mode — the M-PARTS2A path.
    expect(MODAL).toContain("runSearch(false, { term: oem, mode: 'oem' })");
    expect(MODAL).toContain("setMode('oem')");
  });

  it('routes through the modal, not from inside the reference list', () => {
    // The list raises an intent; the modal owns searching.
    expect(REFS_RAW).toContain('onSelect');
    expect(MODAL).toContain('<VehicleOemReferences');
  });
});

describe('the resolved vehicle survives the switch to OEM mode', () => {
  it('every search sends the vehicle context', () => {
    // runSearch builds one body for all modes, so switching to 'oem' cannot
    // drop the vehicle — which is what keeps applicability evaluable.
    const start = MODAL.indexOf('query: q, shopId, currency');
    expect(start).toBeGreaterThan(-1);
    /**
     * Anchored on the literal's last field rather than on a brace: a
     * fixed-width window cut the comment off mid-object, and `}),` matched
     * the inline `: {})` spread a few lines earlier.
     */
    const end = MODAL.indexOf('bypassCache:', start);
    expect(end).toBeGreaterThan(start);
    const body = MODAL.slice(start, end);
    for (const field of ['vehicleId', 'vin', 'make', 'model', 'year', 'trim', 'engine']) {
      expect(body).toContain(field);
    }
  });

  it('the server re-reads the canonical vehicle regardless of mode', () => {
    // Resolution is not conditional on the search mode.
    expect(ROUTE).toContain('await loadCanonicalVehicle(input.shopId, input.vehicleId)');
  });

  it('an OEM search is not scoped by the vehicle-first gate', () => {
    // oem_search answers identity directly; the vehicle-scoped call would be
    // a second call answering a question already answered.
    const gate = readFileSync(
      join(process.cwd(), 'lib/parts/vehicleFirst/gate.ts'), 'utf8');
    expect(gate).toContain('if (input.oemNumber || input.manufacturerPartNumber) return undefined;');
  });
});

describe('the empty-parts message does not contradict the references', () => {
  /**
   * Found live on staging: "NO MATCHING PARTS FOUND. YOU CAN STILL ADD THE
   * PART MANUALLY." printed directly above 91 OEM references the same search
   * had just returned. Both sentences were true — no PURCHASABLE part
   * matched — and together they read as a contradiction.
   */
  it('says something different when references were found', () => {
    expect(MODAL).toContain('No priced parts matched directly');
    expect(MODAL).toContain('pick one below to search it');
  });

  it('branches on whether any reference exists', () => {
    expect(MODAL).toContain("state === 'empty' && (vehicleOem?.groups.length ?? 0) > 0");
    expect(MODAL).toContain("state === 'empty' && !(vehicleOem?.groups.length ?? 0)");
  });

  it('keeps the manual fallback for a genuinely empty search', () => {
    // With no parts AND no references, manual entry is still the way out.
    expect(MODAL).toContain('No matching parts found. {MANUAL_FALLBACK}');
  });
});

describe('model-level ambiguity is a real choice now, never a guess', () => {
  /**
   * M-PARTS2C.1 shipped this as a static panel that only STATED the problem —
   * the resolver counted model candidates into evidence and discarded them, so
   * no choice could be offered. M-PARTS2C.2 returns them and this is now a
   * chooser. What must not change is that nothing is auto-selected.
   */
  const SELECTOR = readFileSync(
    join(process.cwd(), 'features/estimates/VehicleModelSelector.tsx'), 'utf8');

  it('renders a chooser rather than a dead end', () => {
    expect(SELECTOR).toContain('data-testid="model-selector"');
    expect(SELECTOR).toContain('VEHICLE MODEL AMBIGUOUS');
    expect(MODAL).toContain('<VehicleModelSelector');
  });

  it('is driven by the reason code, not inferred from status', () => {
    expect(ROUTE).toContain('reasonCode: outcome.reasonCode');
    expect(MODAL).toContain("resolution?.reasonCode === 'model_ambiguous'");
  });

  it('only offers a choice when there is one to make', () => {
    // One candidate is not a decision.
    expect(MODAL).toContain('(resolution.modelCandidates?.length ?? 0) > 1');
  });

  it('preselects nothing', () => {
    // The resolver could not tell the series apart on the evidence it had. A
    // default would be a guess wearing the resolver's authority, and the
    // answer is stored as technician-confirmed.
    expect(SELECTOR).toContain('useState<number | null>(null)');
    expect(SELECTOR).toContain('disabled={chosen === null || busy}');
  });

  it('says what is required to continue, and that nothing was assumed', () => {
    expect(SELECTOR).toContain('model series matching this vehicle');
    expect(SELECTOR).toContain('Nothing has been assumed');
  });

  it('keeps a way out that does not need the choice', () => {
    expect(SELECTOR).toContain('Search by OEM Instead');
    expect(SELECTOR).toContain('fitment will remain unverified');
  });

  it('shows each series with the years that distinguish it', () => {
    expect(SELECTOR).toContain('Production {span}');
  });
});

describe('choosing a series continues resolution rather than ending it', () => {
  const SELECT_ROUTE = readFileSync(
    join(process.cwd(), 'app/api/parts/vehicle-resolution/select-model/route.ts'), 'utf8');
  const RESOLVER = readFileSync(
    join(process.cwd(), 'lib/parts/vehicleResolution/resolver.ts'), 'utf8');

  it('handles both outcomes: resolved, or a variant still to pick', () => {
    expect(SELECT_ROUTE).toContain("code: 'RESOLVED'");
    expect(SELECT_ROUTE).toContain("code: 'VARIANT_REQUIRED'");
    expect(MODAL).toContain("json?.code === 'VARIANT_REQUIRED'");
  });

  it('writes a mapping ONLY when resolution actually completed', () => {
    // A series alone is not a resolution. Storing one would later read as
    // authoritative.
    const variantBranch = SELECT_ROUTE.slice(SELECT_ROUTE.indexOf("code: 'VARIANT_REQUIRED'"));
    expect(variantBranch).not.toContain('writeMapping');
    expect(SELECT_ROUTE).toContain('NOTHING is written');
  });

  it('validates the chosen id inside the resolver, not at the call site', () => {
    // Same structural reason as candidateWasOffered: the check cannot be
    // skipped by a caller forgetting to call a helper.
    expect(RESOLVER).toContain('chosenModel = offered.find(m => m.id === options.chosenModelId)');
    expect(RESOLVER).toContain('if (!chosenModel)');
  });

  it('refuses a series the resolver never offered', () => {
    expect(SELECT_ROUTE).toContain("code: 'MODEL_INVALID'");
    expect(RESOLVER).toContain('no longer one of the options');
  });

  it('carries the same auth, ownership and fingerprint checks as the variant route', () => {
    expect(SELECT_ROUTE).toContain('vehicleBelongsToShop(input.shopId, input.vehicleId)');
    expect(SELECT_ROUTE).toContain('await loadCanonicalVehicle(input.shopId, input.vehicleId)');
    expect(SELECT_ROUTE).toContain("code: 'VEHICLE_CHANGED'");
  });

  it('holds the search so it resumes after the choice', () => {
    // Model ambiguity carries no modification candidates, so a condition
    // testing only `candidates` left the search unheld and resolving the
    // series resumed nothing.
    expect(MODAL).toContain("(vr.modelCandidates?.length ?? 0) > 1");
  });
});

describe('the chosen series survives into the variant confirmation', () => {
  /**
   * Found live on staging, at the second step of the two-stage flow.
   *
   * The confirm route re-derives candidates server-side — that re-derivation
   * IS the validation. Without the chosen series it re-ran model matching,
   * went ambiguous again, produced no modification candidates, and
   * `candidateWasOffered` rejected the variant the technician had just been
   * shown: "That vehicle variant is no longer one of the options."
   *
   * The series is deliberately not persisted before the vehicle resolves, so
   * it has to travel with the request — untrusted, and checked by the
   * resolver against its own candidate list.
   */
  const CONFIRM_ROUTE = readFileSync(
    join(process.cwd(), 'app/api/parts/vehicle-resolution/confirm/route.ts'), 'utf8');

  it('accepts an optional series on the confirm request', () => {
    expect(CONFIRM_ROUTE).toContain('modelId: z.number().int().positive().optional()');
  });

  it('re-derives WITH that series', () => {
    expect(CONFIRM_ROUTE).toContain('chosenModelId: input.modelId');
  });

  it('still re-derives server-side rather than trusting the body', () => {
    // The fix must not weaken the guard it was routed around.
    expect(CONFIRM_ROUTE).toContain('bypassMapping: true');
    expect(CONFIRM_ROUTE).toContain('candidateWasOffered(input.providerVehicleId, offered)');
  });

  it('the client remembers the series and sends it', () => {
    expect(MODAL).toContain('chosenModelId: modelId');
    expect(MODAL).toContain('modelId: resolution.chosenModelId');
  });

  it('the series stays optional, for vehicles that never needed a choice', () => {
    // Most vehicles resolve a series without asking; requiring it would break
    // every one of them.
    expect(CONFIRM_ROUTE).toContain('.optional()');
  });
});

describe('a vehicle from another shop says so', () => {
  /**
   * Reported from production on a real multi-location estimate: EST-0018
   * sits in one shop and the vehicle it links to sits in another. The server
   * correctly refused to resolve it — a shop must not learn about another
   * shop's vehicle — but the refusal was a `throw`, the outer catch swallowed
   * it, and the technician read "No matching parts found" for a car parked at
   * the other branch.
   *
   * The same misleading silence M-PARTS2C.1 removed, arriving by a different
   * route.
   */
  it('reports the situation instead of throwing it away', () => {
    expect(ROUTE).toContain("reasonCode: 'vehicle_not_in_shop'");
    expect(ROUTE).toContain('parts_vehicle_not_in_shop');
  });

  it('no longer throws on an unreadable vehicle', () => {
    // A throw here lands in the generic catch, which cannot tell this apart
    // from a provider outage and reports neither.
    expect(ROUTE).not.toContain("throw new Error('vehicle not available to this shop')");
  });

  it('still refuses to resolve it', () => {
    // The security behaviour is unchanged: resolution only runs when the
    // vehicle loaded for THIS shop.
    expect(ROUTE).toContain('await loadCanonicalVehicle(input.shopId, input.vehicleId)');
    expect(ROUTE).toContain('if (!canonical)');
  });

  it('gives it its own heading rather than blaming the catalogue', () => {
    expect(MODAL).toContain("resolution.reasonCode === 'vehicle_not_in_shop'");
    expect(MODAL).toContain('This vehicle belongs to a different shop location');
  });

  it('says nothing about the other shop', () => {
    // No shop name, no id, no vehicle detail — only that it is elsewhere.
    /**
     * Anchored on the literal's own bounds rather than a character count —
     * a fixed window broke the moment an explanatory comment was added
     * between the anchor and the string.
     */
    const start = ROUTE.indexOf("reasonCode: 'vehicle_not_in_shop'");
    const end = ROUTE.indexOf('vehicleId: input.vehicleId', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    /**
     * Comments stripped before the ban is applied. The prose explaining WHY
     * this exists legitimately mentions mirroring; the sentence the
     * technician reads must not. Asserting over both flagged my own
     * explanation — the recurring trap in this codebase.
     */
    const reason = ROUTE.slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(reason).toContain('recorded under a different shop location');
    // Names no shop, exposes no id, describes no other record.
    expect(reason).not.toMatch(/shopName|shop_name|otherShop|mirror/i);
  });
});
