/**
 * The draft rules in lib/domain/documentDrafts.ts, below the HTTP layer.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDocumentDraftDomain, lineHasCostData, cleanLines } from '../documentDrafts';
import { createDomainContext } from '../context';
import { DocumentStateError } from '../documentQuery';
import { THB_DEFAULT_SHOP_IDS } from '@/lib/api/writes';
import { createFakeDb } from '@/app/api/v1/__tests__/fakeDb';

const SHOP = 'shop-1';
const apiContext = () => createDomainContext({
  shopId: SHOP,
  actor: { type: 'api', userId: null, role: 'api_key', apiKey: { id: 'k1', name: 'Bot' } },
  capabilities: ['estimates.read', 'estimates.manage', 'invoices.read', 'invoices.manage'],
});

describe('only API keys reach the draft rules', () => {
  it('refuses a staff (user) context', () => {
    const db = createFakeDb();
    const context = createDomainContext({ shopId: SHOP, actor: { type: 'user', userId: 'u1', role: 'owner' } });
    expect(() => createDocumentDraftDomain({ db: db as never, context })).toThrow(/only for API keys/);
  });

  it('refuses an api actor with no key recorded', () => {
    const db = createFakeDb();
    const context = createDomainContext({ shopId: SHOP, actor: { type: 'api', userId: null, role: 'api_key' }, capabilities: [] });
    expect(() => createDocumentDraftDomain({ db: db as never, context })).toThrow(/only for API keys/);
  });
});

describe('a draft edited while a person sends it', () => {
  it('is not overwritten: the update is conditional on Draft', async () => {
    const db = createFakeDb();
    db.tables.estimates = [{ id: 'e1', shop_id: SHOP, status: 'Draft', estimate_number: 'EST-1', lines: [], notes: 'orig' }];

    // The bot reads Draft; a person sends it before the bot's write lands.
    const realFrom = db.from.bind(db);
    let reads = 0;
    (db as { from: (t: string) => unknown }).from = (t: string) => {
      if (t === 'estimates' && ++reads === 2) db.tables.estimates[0].status = 'Sent';
      return realFrom(t);
    };

    const drafts = createDocumentDraftDomain({ db: db as never, context: apiContext() });
    await expect(drafts.updateEstimateDraft('e1', { notes: 'bot edit' })).rejects.toMatchObject({ reason: 'NOT_DRAFT' });
    expect(db.tables.estimates[0]).toMatchObject({ status: 'Sent', notes: 'orig' });
  });
});

describe('lines', () => {
  it('detects data a key cannot see', () => {
    expect(lineHasCostData({ cost: 0 })).toBe(true);
    expect(lineHasCostData({ markup: 1.2 })).toBe(true);
    expect(lineHasCostData({ partsSource: { a: 1 } })).toBe(true);
    expect(lineHasCostData({ description: 'x', qty: 1, rate: 1 })).toBe(false);
  });

  it('keeps only the allowed fields', () => {
    const dirty = [{ description: 'x', note: '', qty: 1, rate: 2, cost: 9, markup: 3, currency: 'USD' }];
    expect(cleanLines(dirty as never)).toEqual([{ description: 'x', note: '', qty: 1, rate: 2, currency: 'USD' }]);
  });
});

describe('DocumentStateError', () => {
  it('carries its reason', () => {
    expect(new DocumentStateError('NOT_APPROVED', 'x').reason).toBe('NOT_APPROVED');
  });
});

describe('the API opens drafts in the same currency as the staff forms', () => {
  it('uses the same D1 shop list as EstimatesView and InvoicesView', () => {
    for (const f of ['features/estimates/EstimatesView.tsx', 'features/invoices/InvoicesView.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      const ids = [...src.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g)].map(m => m[1]);
      const d1 = ids.filter(id => THB_DEFAULT_SHOP_IDS.has(id));
      expect(`${f}: ${[...new Set(d1)].sort().join(',')}`).toBe(`${f}: ${[...THB_DEFAULT_SHOP_IDS].sort().join(',')}`);
      expect(src).toMatch(/isD1Shop \? 'THB' : 'USD'/);
    }
  });
});
