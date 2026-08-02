/**
 * Roster scoping used by the Employees page.
 *
 * Employees are per-location records — the same person can hold a row in each
 * shop with a different role and pay. With mirroring on, listing across shops
 * showed every name twice. Unlike the job-card picker these are real records,
 * so they are scoped to the shop being managed rather than collapsed: hiding a
 * row by name would leave it uneditable and undeletable.
 *
 * The risk this guards against is the opposite one — scoping too aggressively
 * and making staff vanish from every location.
 */

// This file has no imports, so without an export it would be a global script
// and its Tech/L1/L2 would collide with the identically-named locals in
// uniqueTechs.test.ts. Jest runs each file in isolation and never noticed;
// tsc did.
export {};

interface Tech { id: string; name: string; shopId: string }

// Mirrors the filter in features/technicians/TechniciansView.tsx.
function rosterFor(all: Tech[], shopId: string): Tech[] {
  return all.filter(t => !t.shopId || !shopId || t.shopId === shopId);
}

const L1 = 'shop-1';
const L2 = 'shop-2';

const roster: Tech[] = [
  { id: 'a1', name: 'Wally',  shopId: L1 },
  { id: 'a2', name: 'Wally',  shopId: L2 },
  { id: 'b1', name: 'Popeye', shopId: L1 },
  { id: 'c1', name: 'Kat',    shopId: L2 },
];

describe('rosterFor', () => {
  it('shows each person once for the shop being managed', () => {
    const out = rosterFor(roster, L1);
    expect(out.map(t => t.name).sort()).toEqual(['Popeye', 'Wally']);
  });

  it('shows the other location its own staff', () => {
    const out = rosterFor(roster, L2);
    expect(out.map(t => t.name).sort()).toEqual(['Kat', 'Wally']);
  });

  it('keeps the record belonging to the active shop, not an arbitrary one', () => {
    expect(rosterFor(roster, L1).find(t => t.name === 'Wally')!.id).toBe('a1');
    expect(rosterFor(roster, L2).find(t => t.name === 'Wally')!.id).toBe('a2');
  });

  it('every employee remains reachable from exactly one location', () => {
    const seen = new Set([...rosterFor(roster, L1), ...rosterFor(roster, L2)].map(t => t.id));
    expect(seen.size).toBe(roster.length);
  });

  it('keeps rows saved before shop_id existed visible, so they stay editable', () => {
    const legacy = [...roster, { id: 'legacy', name: 'Old Hand', shopId: '' }];
    expect(rosterFor(legacy, L1).some(t => t.id === 'legacy')).toBe(true);
    expect(rosterFor(legacy, L2).some(t => t.id === 'legacy')).toBe(true);
  });

  it('shows everything when the active shop is not yet resolved', () => {
    // useShop resolves asynchronously; an empty shopId must not blank the page.
    expect(rosterFor(roster, '')).toHaveLength(roster.length);
  });

  it('never hides every employee', () => {
    for (const shop of [L1, L2, '']) {
      expect(rosterFor(roster, shop).length).toBeGreaterThan(0);
    }
  });
});
