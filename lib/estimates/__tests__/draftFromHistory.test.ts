import {
  draftFromHistory, vehicleTerms, workTerms, scoreEstimate, lineKey,
  MAX_LINES, type PastEstimate,
} from '../draftFromHistory';

const NOW = new Date('2026-11-27T10:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function est(id: string, vehicle: string, lines: PastEstimate['lines'], extra: Partial<PastEstimate> = {}): PastEstimate {
  return { id, estimate_number: `EST-${id}`, vehicle, status: 'Approved', created_at: ago(30), currency: 'THB', lines, ...extra };
}

const PADS = { description: 'Front brake pads', laoDescription: 'ຜ້າເບກໜ້າ', qty: 1, rate: 1800, cost: 1200, markup: 50 };
const ROTORS = { description: 'Resurface rotors', qty: 2, rate: 400 };
const LABOR = { description: 'Labor', qty: 1, rate: 600 };
const OIL = { description: 'Engine oil 5W-30 6L', qty: 1, rate: 1500 };

describe('terms', () => {
  it('takes make and model words from a vehicle label, ignoring year, plate and VIN', () => {
    expect(vehicleTerms('2018 Toyota Hilux · ກຂ 1234')).toEqual(['toyota', 'hilux']);
    expect(vehicleTerms('Toyota Hilux MR0FZ29G601234567')).toEqual(['toyota', 'hilux']);
    expect(vehicleTerms('')).toEqual([]);
  });

  it('takes work words from job card text, dropping filler and plurals', () => {
    expect(workTerms('Brake complaint — grinding noise when braking. See technician notes.'))
      .toEqual(['brake', 'grinding', 'noise', 'braking']);
    expect(workTerms('Replace brakes pads')).toEqual(['replace', 'brake', 'pad']);
  });

  it('treats punctuation and case as the same line', () => {
    expect(lineKey('Front brake pads.')).toBe(lineKey('front  BRAKE pads'));
  });
});

describe('scoreEstimate', () => {
  const v = vehicleTerms('Toyota Hilux');
  const w = workTerms('brake pads');

  it('needs the same make AND model', () => {
    expect(scoreEstimate(est('1', 'Toyota Hilux 2015', [PADS]), v, w, NOW)).toBeGreaterThan(0);
    expect(scoreEstimate(est('2', 'Toyota Fortuner', [PADS]), v, w, NOW)).toBe(0);
  });

  it('needs similar work when work words are given', () => {
    expect(scoreEstimate(est('3', 'Toyota Hilux', [OIL]), v, w, NOW)).toBe(0);
  });

  it('ignores voided estimates and prefers approved, recent ones', () => {
    expect(scoreEstimate(est('4', 'Toyota Hilux', [PADS], { status: 'Void' }), v, w, NOW)).toBe(0);
    const approved = scoreEstimate(est('5', 'Toyota Hilux', [PADS]), v, w, NOW);
    const declined = scoreEstimate(est('6', 'Toyota Hilux', [PADS], { status: 'Declined' }), v, w, NOW);
    const old = scoreEstimate(est('7', 'Toyota Hilux', [PADS], { created_at: ago(800) }), v, w, NOW);
    expect(approved).toBeGreaterThan(declined);
    expect(approved).toBeGreaterThan(old);
  });
});

describe('draftFromHistory', () => {
  const history: PastEstimate[] = [
    est('1', '2019 Toyota Hilux', [PADS, ROTORS, LABOR], { created_at: ago(10) }),
    est('2', 'Toyota Hilux Revo', [{ ...PADS, rate: 1700 }, LABOR], { created_at: ago(60) }),
    est('3', 'Toyota Hilux', [OIL, LABOR]),                         // other work
    est('4', 'Ford Ranger', [PADS, LABOR]),                          // other vehicle
    est('5', 'Toyota Hilux', [PADS, { description: '', rate: 0 }, { description: 'Labor', rate: 0 }], { status: 'Void' }),
  ];

  it('suggests the usual lines for the same vehicle and work, most common first', () => {
    const r = draftFromHistory({ vehicle: 'Toyota Hilux', workText: 'Brake complaint: grinding, needs pads' }, history, NOW);
    expect(r.matches.map(m => m.number)).toEqual(['EST-1', 'EST-2']);
    expect(r.lines.map(l => [l.description, l.seenIn])).toEqual([
      ['Front brake pads', 2],
      ['Labor', 2],
      ['Resurface rotors', 1],
    ]);
  });

  it('prices each line from the most recent estimate that had it, in that currency', () => {
    const r = draftFromHistory({ vehicle: 'Toyota Hilux', workText: 'brake pads' }, history, NOW);
    expect(r.lines[0]).toMatchObject({
      rate: 1800, cost: 1200, markup: 50, currency: 'THB', laoDescription: 'ຜ້າເບກໜ້າ', sources: ['EST-1', 'EST-2'],
    });
  });

  it('never suggests the estimate being edited, blank lines or unpriced placeholders', () => {
    const r = draftFromHistory({ vehicle: 'Toyota Hilux', workText: 'brake pads', excludeId: '1' }, history, NOW);
    expect(r.matches.map(m => m.number)).toEqual(['EST-2']);
    expect(r.lines.every(l => l.description && l.rate > 0)).toBe(true);
  });

  it('matches on vehicle alone when there is no work text', () => {
    const r = draftFromHistory({ vehicle: 'Ford Ranger', workText: '' }, history, NOW);
    expect(r.matches.map(m => m.number)).toEqual(['EST-4']);
  });

  it('returns nothing when there is nothing to match on', () => {
    expect(draftFromHistory({ vehicle: '', workText: '' }, history, NOW).lines).toEqual([]);
  });

  it(`caps the list at ${MAX_LINES} lines`, () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ description: `Brake part ${String.fromCharCode(97 + i)}`, rate: 100 }));
    const r = draftFromHistory({ vehicle: 'Toyota Hilux', workText: 'brake' }, [est('9', 'Toyota Hilux', many)], NOW);
    expect(r.lines).toHaveLength(MAX_LINES);
  });
});
