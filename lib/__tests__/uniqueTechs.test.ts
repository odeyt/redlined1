/**
 * Deduplication rule used by the job-card technician picker.
 *
 * Each shop keeps its own technician rows, so with mirroring enabled the same
 * person appears once per location — and because assignment is stored by NAME,
 * ticking one box visibly ticked both. The picker must therefore show one entry
 * per person, preferring the active shop's record so the role shown is the one
 * that applies where the job card is being created.
 */

import { uniqueTechsByPerson, type Technician } from '@/services/technicianService';

// Only the fields the rule reads; the rest of Technician is irrelevant here.
type Tech = Pick<Technician, 'id' | 'name' | 'role' | 'shopId'>;
const uniqueTechs = (techs: Tech[], shop: string) => uniqueTechsByPerson(techs as Technician[], shop);

const L1 = 'shop-location-1';
const L2 = 'shop-location-2';

describe('uniqueTechs', () => {
  it('collapses the same person held in two shops to one entry', () => {
    const out = uniqueTechs([
      { id: '1', name: 'Popeye', role: 'Master Technician', shopId: L1 },
      { id: '2', name: 'Popeye', role: 'Master Technician', shopId: L2 },
    ], L1);
    expect(out).toHaveLength(1);
  });

  it('keeps the active shop record, so the role matches where you are working', () => {
    // Wally is Owner in Location 1 and Diagnostics Specialist in Location 2.
    const rows = [
      { id: '1', name: 'Wally', role: 'Diagnostics Specialist', shopId: L2 },
      { id: '2', name: 'Wally', role: 'Owner', shopId: L1 },
    ];
    expect(uniqueTechs(rows, L1)[0].role).toBe('Owner');
    expect(uniqueTechs(rows, L2)[0].role).toBe('Diagnostics Specialist');
  });

  it('keeps the active shop record regardless of input order', () => {
    const rows = [
      { id: '1', name: 'Beck', role: 'Master Mechanic', shopId: L1 },
      { id: '2', name: 'Beck', role: 'Apprentice', shopId: L2 },
    ];
    expect(uniqueTechs(rows, L2)[0].role).toBe('Apprentice');
    expect(uniqueTechs([...rows].reverse(), L2)[0].role).toBe('Apprentice');
  });

  it('falls back to the other shop when the active shop has no record', () => {
    const out = uniqueTechs([{ id: '1', name: 'Kat', role: 'Master Mechanic', shopId: L2 }], L1);
    expect(out).toHaveLength(1);
    expect(out[0].shopId).toBe(L2);
  });

  it('treats names differing only by case or padding as the same person', () => {
    const out = uniqueTechs([
      { id: '1', name: 'Noy', role: 'Mechanic', shopId: L1 },
      { id: '2', name: ' noy ', role: 'Mechanic', shopId: L2 },
    ], L1);
    expect(out).toHaveLength(1);
  });

  it('keeps genuinely different people apart', () => {
    const out = uniqueTechs([
      { id: '1', name: 'Don', role: 'Technician', shopId: L1 },
      { id: '2', name: 'John', role: 'Mechanic', shopId: L1 },
    ], L1);
    expect(out).toHaveLength(2);
  });

  it('returns an empty list unchanged', () => {
    expect(uniqueTechs([], L1)).toEqual([]);
  });
});
