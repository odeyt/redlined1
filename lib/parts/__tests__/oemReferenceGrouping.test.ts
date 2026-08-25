/**
 * OEM reference grouping, against the real payload.
 *
 * The vehicle-scoped endpoint returns one product name repeated across many
 * OEM numbers — 186 rows, 186 numbers, 1 name. Turning that into 186 "part
 * cards" was the M-PARTS2C defect. It becomes ONE group with many references.
 *
 * These run the real grouping function over the sanitized live fixture, rather
 * than asserting that the source contains particular words. The previous suite
 * did the latter and passed while the code was wrong: it checked that
 * `normalizePartNumber(oem)` appeared in the file, which it did — the return
 * value was simply thrown away.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { groupOemReferences } from '../vehicleFirst/search';

const FIXTURE = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/parts/__tests__/fixtures/vehicleOemSearch.live.json'), 'utf8'));

const ROWS = FIXTURE.rows as Array<{ articleOemNo?: string; articleProductName?: string }>;

describe('one product name is one group', () => {
  it('collapses the repeated name', () => {
    const groups = groupOemReferences(ROWS, 'brake pads');
    expect(groups).toHaveLength(1);
    expect(groups[0].productName).toBe('Brake Pad Set, disc brake');
  });

  it('merges names differing only by case or spacing', () => {
    const groups = groupOemReferences([
      { articleOemNo: 'A1', articleProductName: 'Brake Pad Set' },
      { articleOemNo: 'A2', articleProductName: 'BRAKE  PAD SET' },
      { articleOemNo: 'A3', articleProductName: 'brake pad set ' },
    ], 'brake pads');
    expect(groups).toHaveLength(1);
    // The first spelling seen is the one shown.
    expect(groups[0].productName).toBe('Brake Pad Set');
    expect(groups[0].oemNumbers).toHaveLength(3);
  });
});

describe('OEM numbers are deduplicated by their normalised form', () => {
  it('treats spaced and unspaced spellings as one reference', () => {
    /**
     * The fixture holds both "7L0698151M" and "7L0 698 151 M". Before the fix
     * these survived as two references to one part, because the normalised
     * key was computed and then discarded in favour of oem.toUpperCase().
     */
    const groups = groupOemReferences(ROWS, 'brake pads');
    const numbers = groups[0].oemNumbers;
    const spaced = numbers.filter(n => n.replace(/[^A-Z0-9]/gi, '') === '7L0698151M');
    expect(spaced).toHaveLength(1);
  });

  it('keeps genuinely different numbers apart', () => {
    const groups = groupOemReferences(ROWS, 'brake pads');
    expect(groups[0].oemNumbers).toEqual(expect.arrayContaining(['7L0698151M', '7L0698151R']));
  });

  it('skips rows missing either field', () => {
    // The fixture deliberately carries one row with an empty OEM number and
    // one with an empty product name.
    const all = groupOemReferences(ROWS, 'brake pads').flatMap(g => g.oemNumbers);
    expect(all).not.toContain('');
    expect(groupOemReferences(ROWS, 'brake pads').every(g => g.productName.trim())).toBe(true);
  });
});

describe('identity is deterministic', () => {
  it('produces identical groups, order and keys on a second run', () => {
    /**
     * The permanent regression. React keys come from the OEM strings, so any
     * instability here reorders or remounts the list between renders.
     */
    const a = groupOemReferences(ROWS, 'brake pads');
    const b = groupOemReferences(ROWS, 'brake pads');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not depend on the order rows arrived in', () => {
    /**
     * Caught by this test: the displayed spelling was first-seen, so
     * reversing the rows relabelled "7L0698151M" as "7L0 698 151 M". The set
     * was stable but the React keys were not, and an identical search could
     * remount the whole list. The spelling is now canonical — shortest, ties
     * broken lexicographically.
     */
    const forward = groupOemReferences(ROWS, 'brake pads');
    const reversed = groupOemReferences([...ROWS].reverse(), 'brake pads');
    expect(forward[0].oemNumbers).toEqual(reversed[0].oemNumbers);
  });

  it('prefers the compact spelling a technician would type', () => {
    const [g] = groupOemReferences([
      { articleOemNo: '7L0 698 151 M', articleProductName: 'Brake Pad Set' },
      { articleOemNo: '7L0698151M', articleProductName: 'Brake Pad Set' },
    ], 'brake pads');
    expect(g.oemNumbers).toEqual(['7L0698151M']);
  });

  it('yields unique keys, so no two buttons collide', () => {
    const numbers = groupOemReferences(ROWS, 'brake pads').flatMap(g => g.oemNumbers);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('never uses a random or time-based identity', () => {
    const src = readFileSync(join(process.cwd(), 'lib/parts/vehicleFirst/search.ts'), 'utf8');
    expect(src).not.toContain('Math.random');
    expect(src).not.toContain('Date.now');
  });
});

describe('nothing is silently dropped', () => {
  it('returns every distinct reference, with no cap', () => {
    /**
     * There was a MAX_OEM_PER_GROUP of 60. On the live response that
     * discarded 126 of 186 numbers while the count beside the list still read
     * like the whole answer. Long lists are narrowed in the UI, by filtering
     * and paging — never by dropping data on the server without saying so.
     */
    const src = readFileSync(join(process.cwd(), 'lib/parts/vehicleFirst/search.ts'), 'utf8');
    expect(src).not.toContain('MAX_OEM_PER_GROUP');

    const many = Array.from({ length: 200 }, (_, i) => ({
      articleOemNo: `OEM${String(i).padStart(4, '0')}`,
      articleProductName: 'Brake Pad Set, disc brake',
    }));
    expect(groupOemReferences(many, 'brake pads')[0].oemNumbers).toHaveLength(200);
  });
});

describe('a group carries no invented metadata', () => {
  it('has only a name, its references and a relevance', () => {
    const [g] = groupOemReferences(ROWS, 'brake pads');
    expect(Object.keys(g).sort()).toEqual(['oemNumbers', 'productName', 'relevance']);
  });

  it('carries no fitment verdict', () => {
    // There is no part yet, so there is nothing for fitment to describe.
    const [g] = groupOemReferences(ROWS, 'brake pads');
    expect(JSON.stringify(g)).not.toMatch(/fitment|verified|likely/i);
  });
});
