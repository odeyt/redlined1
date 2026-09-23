import { buildSummitDataset, SUMMIT } from '../summitDataset';
import { todayWindow, generationKey, localDateString } from '../clock';
import { planInserts, plannedRowCount, generationOf, isStaleGeneration, schemaFailures, columnsWritten, TABLE_SPECS } from '../plan';

const NOW = new Date('2026-09-23T17:00:00Z');
const d = buildSummitDataset(NOW);

describe('fictional by construction', () => {
  it('uses only the 555-0100..0199 fiction range for phone numbers', () => {
    for (const c of d.customers) expect(c.phone).toMatch(/^\(\d{3}\) 555-01\d{2}$/);
    expect(SUMMIT.phone).toMatch(/555-01\d{2}/);
  });

  it('uses only example.com (RFC 2606) email addresses', () => {
    for (const c of d.customers) expect(c.email).toMatch(/@example\.com$/);
    expect(SUMMIT.email).toMatch(/@example\.com$/);
    for (const t of d.technicians) { expect(t.email).toBeNull(); expect(t.phone).toBeNull(); }
  });

  it('uses VINs that can never be a real VIN (I and O are illegal in a VIN)', () => {
    for (const v of d.vehicles) {
      expect(v.vin).toHaveLength(17);
      expect(v.vin.startsWith('DEMOVIN')).toBe(true);
      expect(v.vin).toMatch(/[IOQ]/);
    }
  });

  it('marks plates, parts and documents so they cannot be mistaken for real ones', () => {
    for (const v of d.vehicles) expect(v.plate).toMatch(/^DEMO-\d{3}$/);
    for (const p of d.parts) expect(p.part_number).toMatch(/^DEMO-/);
    for (const c of d.customers) { expect(c.id).toMatch(/^C-SAF-DEMO-\d{2}$/); expect(c.tags).toContain(SUMMIT.tag); }
    for (const k of [...d.jobCards.map(j => j.id), ...d.invoices.map(i => i.number), ...d.estimates.map(e => e.estimate_number), ...d.payments.map(p => p.reference_number)]) {
      expect(k).toMatch(/^SAF-[A-Z]+-\d{6}-\d{2}$/);
    }
  });

  it('never shares a repair case to the network and never stores a VIN on one', () => {
    for (const r of d.repairCases) { expect(r.share_to_network).toBe(false); expect(r.vin).toBeNull(); expect(r.is_anonymized).toBe(true); }
  });

  it('contains nothing from D1 Imports', () => {
    const blob = JSON.stringify(d).toLowerCase();
    for (const s of ['d1 imports', 'vientiane', 'laos', 'ລາວ', '38d55fae', '90b72748']) expect(blob).not.toContain(s);
  });

  it('prices everything in USD', () => {
    expect(SUMMIT.currency).toBe('USD');
    const blob = JSON.stringify(d);
    expect(blob).not.toContain('THB');
    expect(blob).not.toContain('฿');
  });
});

describe('relative dates', () => {
  it('puts every "today" record inside today for both Chicago and UTC', () => {
    const w = todayWindow(NOW);
    const today = localDateString(NOW);
    const todays = [...d.payments.map(p => p.payment_date), ...d.repairCases.map(r => r.created_at),
      ...d.invoices.filter(i => i.status === 'Paid').map(i => i.paid_date as string)];
    for (const t of todays) {
      expect(t >= w.start.toISOString() && t <= w.end.toISOString()).toBe(true);
      expect(localDateString(new Date(t))).toBe(today);
      expect(t.slice(0, 10)).toBe(NOW.toISOString().slice(0, 10));
    }
  });

  it('never writes a "today" record in the future', () => {
    const all = JSON.stringify(d).match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g) ?? [];
    const future = all.filter(t => t > NOW.toISOString() && !d.invoices.some(i => i.due_date === t.slice(0, 10)));
    expect(future).toEqual([]);
  });

  it('refuses the evening gap, when Chicago is still today but UTC is already tomorrow', () => {
    expect(todayWindow(new Date('2026-09-24T02:00:00Z')).usable).toBe(false); // 21:00 CDT
    expect(todayWindow(new Date('2026-09-23T17:00:00Z')).usable).toBe(true);
  });

  it('keeps completed-this-month jobs inside the month on the 1st', () => {
    const first = buildSummitDataset(new Date('2026-10-01T15:00:00Z'));
    for (const c of first.closedJobs) expect(localDateString(new Date(c.closed_date)).slice(0, 7)).toBe('2026-10');
  });
});

describe('idempotency', () => {
  it('builds the same rows for the same moment', () => {
    expect(buildSummitDataset(NOW)).toEqual(buildSummitDataset(NOW));
  });

  it('builds the same keys all day long, so a second run the same day finds everything', () => {
    const later = buildSummitDataset(new Date('2026-09-23T21:00:00Z'));
    for (const spec of TABLE_SPECS) {
      expect(spec.rows(later).map(r => r[spec.key])).toEqual(spec.rows(d).map(r => r[spec.key]));
    }
  });

  it('plans every row on a first run and nothing on a second', () => {
    const first = planInserts(d, {});
    expect(plannedRowCount(first)).toBeGreaterThan(0);
    const existing = Object.fromEntries(first.map(p => [p.table, new Set(p.rows.map(r => String(r[p.key])))]));
    expect(plannedRowCount(planInserts(d, existing))).toBe(0);
  });

  it('has unique keys within every table', () => {
    for (const spec of TABLE_SPECS) {
      const keys = spec.rows(d).map(r => String(r[spec.key]));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('starts a new generation on a new day, keeping static records', () => {
    const tomorrow = buildSummitDataset(new Date('2026-09-24T17:00:00Z'));
    expect(tomorrow.generation).not.toBe(d.generation);
    expect(tomorrow.customers).toEqual(d.customers);
    expect(generationOf(tomorrow.jobCards[0].id)).toBe(generationKey(new Date('2026-09-24T17:00:00Z')));
    expect(isStaleGeneration(d.jobCards[0].id, tomorrow.generation)).toBe(true);
    expect(isStaleGeneration(tomorrow.jobCards[0].id, tomorrow.generation)).toBe(false);
    expect(isStaleGeneration('C-SAF-DEMO-01', tomorrow.generation)).toBe(false);
  });

  it('inserts parents before the rows that reference them', () => {
    const order = TABLE_SPECS.map(s => s.table);
    expect(order.indexOf('customers')).toBeLessThan(order.indexOf('vehicles'));
    expect(order.indexOf('invoices')).toBeLessThan(order.indexOf('payments'));
    expect(order.indexOf('job_cards')).toBeLessThan(order.indexOf('repair_orders'));
  });
});

describe('live-schema check', () => {
  const written = columnsWritten(d);
  const schemaFrom = (w: Record<string, string[]>, extra: Record<string, { required?: string[] }> = {}) => ({
    definitions: Object.fromEntries(Object.entries(w).map(([t, cols]) => [t, {
      properties: Object.fromEntries(cols.map(c => [c, {}])), required: extra[t]?.required ?? [],
    }])),
  });

  it('passes when every written column exists', () => {
    expect(schemaFailures(schemaFrom(written), written)).toEqual([]);
  });

  it('refuses when the schema cannot be read, a column is missing, or a required column is not written', () => {
    expect(schemaFailures(null, written)).toHaveLength(1);
    const missing = { ...written, parts: written.parts.filter(c => c !== 'currency') };
    expect(schemaFailures(schemaFrom(missing), written)).toContain('parts.currency: column does not exist');
    expect(schemaFailures(schemaFrom(written, { invoices: { required: ['owner_id'] } }), written))
      .toContain('invoices.owner_id: required on insert but not written');
  });
});
