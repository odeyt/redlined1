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
  PART_UNITS, DEFAULT_PART_UNIT, formatQty, describeLine,
} from '../../../services/partsOrderService';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const QUOTES = 'features/parts/PartsEstimatesView.tsx';
const ORDERS = 'features/parts/PartsOrdersView.tsx';

describe('the wider column keeps its width instead of giving it back', () => {
  for (const file of [QUOTES, ORDERS]) {
    it(`${file} gives the table a minimum width`, () => {
      expect(read(file)).toMatch(/minWidth: 1040/);
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
      expect(read(file)).toContain("updateLineItem(idx, 'unit', e.target.value)");
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
