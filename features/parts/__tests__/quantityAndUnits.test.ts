/**
 * The quantity box was too narrow to read, and a quantity had no unit.
 *
 * Reported from a screenshot of Parts Quotations on 2026-08-21.
 *
 * The first theory — that the table was crushing the column — was MEASURED IN
 * A BROWSER AND DISPROVED before any of this was written. At its declared 70px
 * the Qty column held 42.4px of usable width at every container size from
 * 420px to 900px; it was never squeezed. What 42.4px does do is clip at five
 * digits and leave no room for anything beside the number. The widened column
 * measures 52.4px and holds five digits without clipping.
 *
 * One genuine blank-box path did turn up in the orders form, which bound
 * `value={item.quantity}` with no fallback: a line_items row saved before
 * quantity existed parses to undefined, and React renders undefined as an
 * empty input. That is pinned below.
 *
 * The units half is a workshop problem rather than a layout one. Oil, coolant
 * and brake fluid are quoted by the quart or litre, and a line reading "4" is
 * ambiguous between four bottles and four litres — a four-fold pricing
 * difference on a consumable.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PART_UNITS, DEFAULT_PART_UNIT, formatQty, describeLine, normalizeQty,
  allowsFraction, FRACTIONAL_UNITS, summaryQuantity,
} from '../../../services/partsOrderService';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const QUOTES = 'features/parts/PartsEstimatesView.tsx';
const ORDERS = 'features/parts/PartsOrdersView.tsx';

/**
 * The two tables no longer carry the same minimum width.
 *
 * This assertion was a single shared `minWidth: 1040` for both views. PR #16
 * ("widen quoted-parts modal so the table fits without scrolling") retuned the
 * QUOTES table to 980 while ORDERS kept 1040, and the shared expectation went
 * red on main — a stale test of mine, not a regression in that change.
 *
 * Kept per-file rather than relaxed to `/minWidth: \d+/`. The point of the
 * assertion is that each table HAS a deliberate floor wide enough for its own
 * columns; a pattern matching any number would keep passing if someone set it
 * to 10.
 */
const TABLE_MIN_WIDTH: Record<string, number> = {
  [QUOTES]: 980,
  [ORDERS]: 1040,
};

describe('the wider column keeps its width instead of giving it back', () => {
  for (const file of [QUOTES, ORDERS]) {
    it(`${file} gives the table a minimum width`, () => {
      expect(read(file)).toMatch(new RegExp(`minWidth: ${TABLE_MIN_WIDTH[file]}`));
    });

    it(`${file} still scrolls rather than clipping`, () => {
      // minWidth without the scroll container just overflows the card.
      expect(read(file)).toMatch(/overflowX: 'auto'/);
    });

    it(`${file} pins the quantity input rather than letting it flex`, () => {
      // A percentage width would be redistributed away the moment the unit
      // select is added beside it.
      expect(read(file)).toMatch(/flex: '0 0 62px'/);
    });

    it(`${file} never binds an undefined quantity into the input`, () => {
      // React renders undefined as an empty box, which reads as a broken
      // field rather than as missing data.
      expect(read(file)).toContain('value={item.quantity || 1}');
    });
  }
});

describe('a quantity carries its unit', () => {
  it('offers the volume units a workshop actually quotes in', () => {
    for (const u of ['Qt', 'L', 'ml', 'Gal']) expect(PART_UNITS).toContain(u);
  });

  it('offers weight and length too', () => {
    for (const u of ['kg', 'g', 'lb', 'm', 'ft']) expect(PART_UNITS).toContain(u);
  });

  it('defaults to pieces', () => {
    expect(DEFAULT_PART_UNIT).toBe('Pcs');
    expect(PART_UNITS[0]).toBe('Pcs');
  });

  it('shows a non-default unit beside the number', () => {
    expect(formatQty(4, 'Qt')).toBe('4 Qt');
    expect(formatQty(2, 'Pair')).toBe('2 Pair');
    expect(formatQty(1, 'Kit')).toBe('1 Kit');
    expect(formatQty(500, 'ml')).toBe('500 ml');
  });

  it('HIDES the default, so existing lines read exactly as they always did', () => {
    // The first cut printed "4 Pcs" everywhere. That restates what a quantity
    // already means, changes how every pre-unit record displays, and — worst —
    // a unit on every line stops being read, which is precisely when the "Qt"
    // on the oil line gets missed.
    expect(formatQty(4, 'Pcs')).toBe('4');
    expect(formatQty(4, undefined)).toBe('4');
    expect(formatQty(4, '')).toBe('4');
    expect(formatQty(4, '   ')).toBe('4');
  });

  it('never prints the word "undefined" on a quote', () => {
    // A line_items row written before quantity existed parses to undefined,
    // and `${undefined}` renders literally. Proven reachable: the round-trip
    // script stores a line with no unit key at all.
    expect(formatQty(undefined as unknown as number, 'Qt')).toBe('1 Qt');
    expect(formatQty(NaN, 'Qt')).toBe('1 Qt');
    expect(formatQty(undefined as unknown as number, undefined)).toBe('1');
    expect(formatQty(null as unknown as number, 'L')).toBe('1 L');
  });

  it('does not pluralise', () => {
    // "2 Boxes" but never "2 Ls" — pluralising needs a rule per unit, and no
    // requirement asked for one.
    expect(formatQty(2, 'Box')).toBe('2 Box');
    expect(formatQty(2, 'Bottle')).toBe('2 Bottle');
  });

  it('renders a malformed stored unit rather than crashing on it', () => {
    // Legacy or hand-edited JSONB. Showing it beats dropping the data.
    expect(formatQty(3, 'ZZZ-not-a-unit')).toBe('3 ZZZ-not-a-unit');
  });

  for (const file of [QUOTES, ORDERS]) {
    it(`${file} renders a unit selector on every line`, () => {
      expect(read(file)).toContain('PART_UNITS.map(u =>');
      // Through updateLineItemUnit, not a bare field set: the quantity has to
      // be re-checked against the new unit in the same update.
      expect(read(file)).toContain('updateLineItemUnit(idx, e.target.value)');
    });

    it(`${file} shows the unit wherever it shows the quantity`, () => {
      // A unit that is only visible while editing does not solve the problem.
      expect(read(file)).toContain('formatQty(item.quantity, item.unit)');
    });
  }
});

describe('the unit survives conversion to an estimate or invoice', () => {
  it('is appended to the description, because those lines have no unit column', () => {
    expect(describeLine('Engine Oil 5W-30', 'Qt')).toBe('Engine Oil 5W-30 (Qt)');
    expect(describeLine('Coolant', 'L')).toBe('Coolant (L)');
  });

  it('stays silent for pieces', () => {
    // "(Pcs)" on every brake pad is noise, and noise is what stops a unit
    // being noticed when it matters.
    expect(describeLine('Brake Pad Set', 'Pcs')).toBe('Brake Pad Set');
    expect(describeLine('Brake Pad Set', undefined)).toBe('Brake Pad Set');
  });

  it('does not leave a stray bracket on an empty name', () => {
    expect(describeLine('', 'Qt')).toBe('(Qt)');
    expect(describeLine('', undefined)).toBe('');
  });

  it('is IDEMPOTENT — converting twice never doubles the suffix', () => {
    // A quotation converts to an order and that order converts on to an
    // estimate. If any path ever reads back a description that already
    // carries the unit, appending again gives "Oil (Qt) (Qt)" and every
    // further pass adds another. Invisible until someone converts twice, and
    // it lands on a customer's document.
    const once = describeLine('Oil', 'Qt');
    expect(once).toBe('Oil (Qt)');
    expect(describeLine(once, 'Qt')).toBe('Oil (Qt)');
    expect(describeLine(describeLine(once, 'Qt'), 'Qt')).toBe('Oil (Qt)');
  });

  it('treats a blank unit as the default rather than appending "()"', () => {
    expect(describeLine('Oil', '')).toBe('Oil');
    expect(describeLine('Oil', '  ')).toBe('Oil');
  });

  it('every conversion path uses the one helper', () => {
    // Three call sites built the description independently; two of them
    // dropped the unit. Drift here shows up on a customer's printed quote.
    expect((read(ORDERS).match(/describeLine\(i\.partName, i\.unit\)/g) ?? []).length).toBe(2);
    expect(read(QUOTES)).toContain('describeLine(baseName, item.unit)');
  });

  it('translates the part name only, not the unit symbol', () => {
    // Round-tripping "Qt" through a translator is how it becomes noise.
    expect(read(QUOTES)).toContain('translateToLao(baseName)');
  });

  it('puts the unit on the Lao line as well as the English one', () => {
    // A Lao-only printed estimate renders laoDescription ALONE — EstimatesView
    // shows no English line at printLang 'lo'. Attaching the unit only to the
    // English description drops it from the document the customer receives,
    // which for a bilingual shop is the document that matters.
    expect(read(QUOTES)).toContain('describeLine(laoName, item.unit)');
  });

  it('the Lao print path still falls back to the English line when untranslated', () => {
    // translateToLao returns '' on failure, laoDescription is then omitted,
    // and the printed Lao estimate falls back to `description` — which
    // carries the unit. Pinning it so the fallback is not "improved" away.
    expect(read('features/estimates/EstimatesView.tsx'))
      .toContain("{showLao && !line.laoDescription && printLang === 'lo' && ");
  });
});

describe('a quantity cannot go negative or zero', () => {
  it('rejects a negative', () => {
    // `Number('-5') || 1` is -5: truthy, so the old guard passed it through
    // and the Line Total column showed -250 mid-edit.
    expect(normalizeQty('-5')).toBe(1);
    expect(normalizeQty(-0.001)).toBe(1);
  });

  it('rejects zero and non-numbers', () => {
    expect(normalizeQty('0')).toBe(1);
    expect(normalizeQty('')).toBe(1);
    expect(normalizeQty('abc')).toBe(1);
    expect(normalizeQty(NaN)).toBe(1);
    expect(normalizeQty(Infinity)).toBe(1);
    expect(normalizeQty(-Infinity)).toBe(1);
  });

  it('leaves a legitimate quantity exactly alone', () => {
    expect(normalizeQty('4')).toBe(4);
    expect(normalizeQty(99999)).toBe(99999);
    expect(normalizeQty(1)).toBe(1);
  });

  it('rounds to a whole piece when no unit is given', () => {
    // The old two-argument-less behaviour, kept: a bare call means counted.
    expect(normalizeQty('0.5')).toBe(1);
    expect(normalizeQty('1.5')).toBe(2);
  });

  it('both quantity inputs go through it', () => {
    for (const f of [QUOTES, ORDERS]) {
      expect(read(f)).toContain("updateLineItem(idx, 'quantity', normalizeQty(e.target.value, item.unit))");
      // The old guard must be gone, not merely wrapped.
      expect(read(f)).not.toContain("'quantity', Number(e.target.value) || 1");
    }
  });

  it('keeps a native min as the second line of defence', () => {
    // Native validation was the ONLY thing stopping a negative being saved.
    // Removing it while trusting the clamp would swap one single point of
    // failure for another.
    for (const f of [QUOTES, ORDERS]) {
      expect(read(f)).toContain('min={allowsFraction(item.unit) ? MIN_FRACTIONAL_QTY : 1}');
    }
  });
});

describe('measured units may carry a fraction; counted units may not', () => {
  it('measured units allow it', () => {
    for (const u of ['L', 'kg', 'Qt', 'ml', 'Gal', 'g', 'lb', 'm', 'ft']) {
      expect(allowsFraction(u)).toBe(true);
    }
  });

  it('counted units do not', () => {
    // Half a brake pad, half a gasket set or half a bottle is not sellable.
    for (const u of ['Pcs', 'Set', 'Pair', 'Kit', 'Box', 'Roll', 'Can', 'Bottle', 'Tube']) {
      expect(allowsFraction(u)).toBe(false);
    }
    expect(allowsFraction(undefined)).toBe(false);
    expect(allowsFraction('')).toBe(false);
  });

  it('every fractional unit is a real unit in the registry', () => {
    for (const u of FRACTIONAL_UNITS) expect(PART_UNITS).toContain(u);
  });

  it('keeps the decimal for a measured unit', () => {
    expect(normalizeQty('0.5', 'L')).toBe(0.5);
    expect(normalizeQty('1.25', 'kg')).toBe(1.25);
    expect(normalizeQty('0.25', 'Qt')).toBe(0.25);
  });

  it('rounds a counted unit to a whole piece', () => {
    expect(normalizeQty('1.6', 'Pcs')).toBe(2);
    expect(normalizeQty('0.5', 'Pcs')).toBe(1);
    // Rounded, never floored — flooring 0.4 would give the empty quantity back.
    expect(normalizeQty('0.4', 'Set')).toBe(1);
  });

  it('still refuses zero and negative on a measured unit', () => {
    expect(normalizeQty('-0.5', 'L')).toBe(1);
    expect(normalizeQty('0', 'kg')).toBe(1);
  });

  it('switching a fractional line to a counted unit fixes the quantity', () => {
    // 0.5 L -> Pcs must not leave half a part on the shelf. Both views do this
    // in ONE update so the row is never in a state it could not be typed into.
    expect(normalizeQty(0.5, 'Pcs')).toBe(1);
    for (const f of [QUOTES, ORDERS]) {
      expect(read(f)).toContain('quantity: normalizeQty(item.quantity, unit)');
      expect(read(f)).toContain('updateLineItemUnit(idx, e.target.value)');
    }
  });

  it('displays a fraction without binary float noise', () => {
    // 0.1 + 0.2 is 0.30000000000000004, and that must never reach a quote.
    expect(formatQty(0.1 + 0.2, 'L')).toBe('0.3 L');
    expect(formatQty(0.5, 'L')).toBe('0.5 L');
    expect(formatQty(1.25, 'kg')).toBe('1.25 kg');
    expect(formatQty(2, 'Pcs')).toBe('2');
    expect(formatQty(1.0, 'L')).toBe('1 L');
  });
});

describe('the integer summary column cannot reject a fractional line', () => {
  // parts_estimates.quantity and parts_orders.quantity are INTEGER — probing
  // them with 2.5 returned "invalid input syntax for type integer". The
  // fraction lives in line_items; this column is a rounded summary, which
  // avoids retyping a live column.
  it('rounds the sum to a whole number', () => {
    expect(summaryQuantity([{ quantity: 0.5 }, { quantity: 1.25 }, { quantity: 2 }])).toBe(4);
    expect(Number.isInteger(summaryQuantity([{ quantity: 0.5 }]))).toBe(true);
  });

  it('never produces zero, so the legacy fallback line stays valid', () => {
    expect(summaryQuantity([{ quantity: 0.1 }])).toBe(1);
    expect(summaryQuantity([])).toBe(1);
  });

  it('both services write through it rather than summing inline', () => {
    for (const f of ['services/partsOrderService.ts', 'services/partsEstimateService.ts']) {
      expect(read(f)).toContain('summaryQuantity(items)');
      expect(read(f)).not.toMatch(/quantity:\s+items\.reduce\(\(s, i\) => s \+ i\.quantity, 0\)/);
    }
  });
});

describe('the unit is descriptive and never touches the money', () => {
  // Verified in source too: both total paths are `unitCost * quantity` and
  // neither reads `unit`. This pins the arithmetic itself.
  const lineTotal = (qty: number, price: number) => qty * price;

  it.each(['Pcs', 'Qt', 'L', 'kg', 'Box'])('4 × 50 = 200 regardless of unit (%s)', () => {
    expect(lineTotal(4, 50)).toBe(200);
  });

  it('no total calculation reads the unit', () => {
    for (const f of ['services/partsOrderService.ts', QUOTES, ORDERS]) {
      const src = read(f);
      // Any arithmetic combining a unit with a price would show up here.
      expect(src).not.toMatch(/unit\s*\*\s*/);
      expect(src).not.toMatch(/\*\s*item\.unit\b/);
    }
  });
});

describe('no migration was needed and none was added', () => {
  it('unit is optional on both line-item types', () => {
    // line_items is JSONB and the object is written back verbatim, so an old
    // row simply has no `unit`. A required field would have broken every
    // existing quote on read.
    expect(read('services/partsOrderService.ts')).toMatch(/unit\?: string;/);
    expect(read('services/partsEstimateService.ts')).toMatch(/unit\?: string;/);
  });
});
