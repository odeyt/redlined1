/**
 * Closing a job card archives it under the JOB's shop, not the active one.
 *
 * D1 Imports was merged into Location 2 with 44 job cards still open. Staff
 * now close them from Location 2; the closed_jobs row must stay a D1 Imports
 * record, like every other historical edit keeps its shop_id.
 */
const SHOP_ACTIVE = 'loc2';
const SHOP_JOB = 'd1';

const inserts: { table: string; row: Record<string, unknown> }[] = [];
let sourceRow: { shop_id: string } | null = { shop_id: SHOP_JOB };

jest.mock('@/lib/shopStore', () => ({
  getShopId: () => SHOP_ACTIVE,
  getShopIds: () => [SHOP_ACTIVE, SHOP_JOB],
}));
jest.mock('@/lib/domain/auditFromBrowser', () => ({ recordAudit: jest.fn() }));
jest.mock('@/intelligence/IntelligenceService', () => ({ publishEvent: jest.fn() }), { virtual: true });

jest.mock('@/lib/supabase', () => {
  function chain(table: string) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['select', 'eq', 'in', 'update', 'delete']) c[m] = self;
    c.maybeSingle = () => Promise.resolve({ data: table === 'job_cards' ? sourceRow : null, error: null });
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
    c.insert = (row: Record<string, unknown>) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); };
    return c;
  }
  return { supabase: { from: (table: string) => chain(table) } };
});

import { closeJob } from '../jobCardService';
import type { JobCardFull } from '../jobCardService';

const job = {
  id: 'JC-0001', ro: 'RO-00001', invoice: 'INV-0001', customer: 'Ai Peng', vehicle: 'Camry',
  serviceType: '', channel: '', location: '', technicians: [], status: 'Booked', priority: '',
  approval: '', laborHours: 0, partsTotal: 0, workflow: [], checkInDate: '2026-09-01', notes: '',
} as unknown as JobCardFull;

beforeEach(() => { inserts.length = 0; sourceRow = { shop_id: SHOP_JOB }; });

it("archives a mirrored shop's job under that shop, not the active one", async () => {
  await closeJob(job);
  const archived = inserts.find(i => i.table === 'closed_jobs')!;
  expect(archived.row.shop_id).toBe(SHOP_JOB);
});

it('falls back to the active shop when the job row is not found', async () => {
  sourceRow = null;
  await closeJob(job);
  expect(inserts.find(i => i.table === 'closed_jobs')!.row.shop_id).toBe(SHOP_ACTIVE);
});
