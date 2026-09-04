/**
 * M-ACTIVATION1 — shop identity readiness, EXECUTED.
 *
 * Reproduced against production before any of this was written. KARS has no
 * `shop_settings` row, and the three output paths each invented a different
 * answer for the missing name:
 *
 *     fetchShopSettings()       -> "My Shop"
 *     invoice print / preview   -> "Redlined1"      (our own product name)
 *     send-document email       -> PGRST116, the send fails
 *
 * So the invoice was never blank. It carried our name onto their customer's
 * document. These tests pin the single rule that replaced all three.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  evaluateShopIdentity, describeMissing, SHOP_IDENTITY_FIELDS,
  SHOP_IDENTITY_INCOMPLETE,
} from '../shopIdentity';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const COMPLETE = { company_name: 'KARS', address: '12 Workshop Rd', phone: '020 5555 1234' };

describe('a complete profile is ready', () => {
  it('reports ready with nothing missing', () => {
    const r = evaluateShopIdentity('shop-1', COMPLETE);
    expect(r).toEqual({
      ready: true, missingFields: [], settingsRowExists: true,
      shopId: 'shop-1', reasonCode: 'ready',
    });
  });
});

describe('a missing settings row blocks output', () => {
  /** Four of eight active tenants are in exactly this state. */
  it('is not ready, and says the row is the problem', () => {
    const r = evaluateShopIdentity('shop-1', null);
    expect(r.ready).toBe(false);
    expect(r.settingsRowExists).toBe(false);
    expect(r.reasonCode).toBe('settings_row_missing');
    expect(r.missingFields).toEqual(['businessName', 'address', 'phone']);
  });

  it('distinguishes "no row" from "row full of blanks"', () => {
    // They need different repairs — one needs a row created, the other needs a
    // person to type an address — so they are never collapsed into one code.
    const noRow = evaluateShopIdentity('s', null);
    const blank = evaluateShopIdentity('s', { company_name: '', address: '', phone: '' });
    expect(noRow.reasonCode).toBe('settings_row_missing');
    expect(blank.reasonCode).toBe('identity_incomplete');
    expect(blank.settingsRowExists).toBe(true);
  });
});

describe('each required field blocks on its own', () => {
  it('missing business name', () => {
    const r = evaluateShopIdentity('s', { ...COMPLETE, company_name: null });
    expect(r.ready).toBe(false);
    expect(r.missingFields).toEqual(['businessName']);
  });

  it('missing address', () => {
    const r = evaluateShopIdentity('s', { ...COMPLETE, address: null });
    expect(r.ready).toBe(false);
    expect(r.missingFields).toEqual(['address']);
  });

  it('missing phone', () => {
    const r = evaluateShopIdentity('s', { ...COMPLETE, phone: null });
    expect(r.ready).toBe(false);
    expect(r.missingFields).toEqual(['phone']);
  });

  it('the two real tenants with a name but no address or phone', () => {
    // Tapia Auto and peter repair shop. A row exists, so "does the row exist"
    // was never the question worth asking.
    const r = evaluateShopIdentity('s', { company_name: 'Tapia Auto', address: '', phone: '' });
    expect(r.ready).toBe(false);
    expect(r.settingsRowExists).toBe(true);
    expect(r.missingFields).toEqual(['address', 'phone']);
  });
});

describe('whitespace is not a value', () => {
  it('treats a spaces-only field as missing', () => {
    // What a form produces when someone tabs through it, and indistinguishable
    // from empty on a printed invoice.
    const r = evaluateShopIdentity('s', { company_name: '   ', address: '\t', phone: '\n ' });
    expect(r.ready).toBe(false);
    expect(r.missingFields).toEqual(['businessName', 'address', 'phone']);
  });
});

describe('it requires nothing the product does not', () => {
  it('asks for exactly three fields', () => {
    // No logo, tax id, website or email. A readiness check stricter than the
    // product would block shops that are genuinely fine.
    expect(SHOP_IDENTITY_FIELDS.map(f => f.key))
      .toEqual(['businessName', 'address', 'phone']);
  });

  it('is ready without a logo, website, email or tax id', () => {
    expect(evaluateShopIdentity('s', COMPLETE).ready).toBe(true);
  });
});

describe('what the operator is told', () => {
  it('names the missing fields in plain words', () => {
    expect(describeMissing(['address', 'phone'])).toBe('business address and telephone number');
    expect(describeMissing(['businessName'])).toBe('business name');
    expect(describeMissing([])).toBe('');
  });

  it('never mentions a table or column name', () => {
    const all = SHOP_IDENTITY_FIELDS.map(f => f.label).join(' ') + describeMissing(['businessName', 'address', 'phone']);
    expect(all).not.toMatch(/shop_settings|company_name|_id\b/);
  });
});

describe('the server is the authority, not the browser', () => {
  it('the document route refuses before generating anything', () => {
    const route = read('app/api/send-document/route.ts');
    // Before the PDF is built and before anything is emailed.
    const gateAt = route.indexOf('loadShopIdentity(shopId)');
    const buildAt = route.indexOf('await buildPdf(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(gateAt);
    expect(route).toContain(SHOP_IDENTITY_INCOMPLETE);
  });

  it('a direct POST cannot bypass it', () => {
    // The check is in the route body, not conditioned on any client-supplied
    // flag. curl gets the same refusal as a click.
    const route = read('app/api/send-document/route.ts');
    expect(route).toMatch(/const identity = await loadShopIdentity\(shopId\);\s*\n\s*if \(!identity\.ready\)/);
  });

  it('stopped using .single(), which raised PGRST116 on a missing row', () => {
    const route = read('app/api/send-document/route.ts');
    expect(route).toMatch(/from\('shop_settings'\)\.select\('\*'\)\.eq\('shop_id', shopId\)\.maybeSingle\(\)/);
  });

  it('the readiness endpoint requires membership of the shop', () => {
    // Which fields a shop is missing is a small disclosure about another
    // business, not something any session may read.
    const route = read('app/api/shop/identity/route.ts');
    expect(route).toMatch(/from\('shop_users'\)[\s\S]{0,200}\.eq\('shop_id', shopId\)/);
    expect(route).toMatch(/if \(!membership\)/);
  });

  it('a failed read is never treated as ready', () => {
    // A check that fails open does nothing on exactly the day the database is
    // unhappy.
    const server = read('lib/shops/shopIdentityServer.ts');
    expect(server).toMatch(/if \(error\) \{\s*\n\s*return evaluateShopIdentity\(shopId, null\);/);
  });
});

describe('the invoice view gates in one place, and only the outputs', () => {
  const view = read('features/invoices/InvoicesView.tsx');

  it('both print buttons go through the same gate', () => {
    expect(view).toMatch(/function blockedForIdentity/);
    expect(view).toMatch(/if \(blockedForIdentity\('printed'\)\) return;/);
    expect(view).toMatch(/if \(blockedForIdentity\('sent'\)\) return;/);
  });

  it('stops before generating, so the invoice is never mutated', () => {
    const print = view.slice(view.indexOf('async function printInvoice'));
    const gate = print.indexOf("blockedForIdentity('printed')");
    const opens = print.indexOf('signStoredUrlClient');
    expect(gate).toBeGreaterThan(-1);
    expect(opens).toBeGreaterThan(gate);
  });

  it('does NOT gate saving a draft, or creating customers and vehicles', () => {
    // Work must continue. Only the customer-facing output is withheld.
    expect(view).not.toMatch(/blockedForIdentity\('saved'\)/);
    expect(view).not.toMatch(/blockedForIdentity\('created'\)/);
  });

  it('honours a server refusal even when its own answer is stale', () => {
    expect(view).toMatch(/res\.status === 409 && json\.code === SHOP_IDENTITY_INCOMPLETE/);
    expect(view).toMatch(/identity\.refresh\(\)/);
  });

  it('returns the operator to the invoice after settings', () => {
    expect(view).toMatch(/function openShopSettings\(\)[\s\S]{0,200}SET_MODULE', module: 'settings'/);
    expect(view).toMatch(/setIdentityBlocked\(null\)/);
  });
});

describe('the migration creates the row transactionally and invents nothing', () => {
  const sql = read('supabase/migrations/2026-09-02_m_activation1_shop_settings_lifecycle.sql');

  it('a trigger on shops creates the settings row', () => {
    expect(sql).toMatch(/AFTER INSERT ON public\.shops/);
    /**
     * This required the BARE `INSERT (shop_id)` — the exact form that takes
     * the 'Redline' column default. Written before that default was known, it
     * would have failed the corrected migration and passed the broken one.
     *
     * The property is that the trigger inserts a settings row, not which
     * columns it names; the blank VALUES are asserted below.
     */
    expect(sql).toMatch(/INSERT INTO public\.shop_settings \(shop_id/);
  });

  it('is idempotent, and has the constraint that makes it so', () => {
    expect(sql).toMatch(/ON CONFLICT \(shop_id\) DO NOTHING/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS shop_settings_shop_id_key/);
  });

  it('proves the trigger fires rather than asserting it attached', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'shops_create_settings did not fire/);
    expect(sql).toMatch(/RAISE EXCEPTION 'shop_settings is not idempotent/);
  });

  it('writes no invented identity', () => {
    /**
     * Asserted on the VALUES, not the column names.
     *
     * This banned the names outright, which was wrong: the trigger has to name
     * company_name, address and phone precisely so it can write them BLANK and
     * override the 'Redline' column default. Banning the names would have
     * forced the bare insert that takes the default — the very bug.
     *
     * What must never appear is a non-empty literal in those columns.
     */
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('DROP TRIGGER'));
    const values = body.match(/VALUES \(([^)]*)\)/)?.[1] ?? '';
    // NEW.id plus three empty strings, and nothing else.
    expect(values.replace(/\s/g, '')).toBe("NEW.id,'','',''");
    // No tax or owner information is touched at all.
    expect(body).not.toMatch(/tax|owner_id/);
  });

  it('does not bulk-write production data', () => {
    // The backfill is present as a comment for approval, never executed.
    const statements = sql.replace(/^\s*--.*$/gm, '');
    expect(statements).not.toMatch(/INSERT INTO public\.shop_settings \(shop_id\)\s*\n\s*SELECT/);
  });
});

describe('the trigger must not let a column default stand in for identity', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', '..',
      'supabase/migrations/2026-09-02_m_activation1_shop_settings_lifecycle.sql'), 'utf8');

  /**
   * Found by probing production: `shop_settings.company_name` carries a column
   * DEFAULT of 'Redline'. A bare `INSERT (shop_id)` therefore produces a row
   * whose business name is our own product name.
   *
   * The readiness rule would accept that as a real name. The shop would fill
   * in address and telephone, be marked ready, and print invoices headed
   * "Redline" — this milestone's original bug, re-created by its own fix and
   * harder to find, because nothing would read as missing.
   */
  it('writes the identity columns explicitly blank', () => {
    expect(sql).toMatch(/INSERT INTO public\.shop_settings \(shop_id, company_name, address, phone\)/);
    expect(sql).toMatch(/VALUES \(NEW\.id, '', '', ''\)/);
  });

  it('never inserts shop_id alone, which would take the default', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('DROP TRIGGER'));
    expect(fn).not.toMatch(/INSERT INTO public\.shop_settings \(shop_id\)\s*\n\s*VALUES \(NEW\.id\)/);
  });

  it('the probe proves the row is blank, not merely present', () => {
    // Counting rows would have passed while every one of them said "Redline".
    expect(sql).toMatch(/wrote invented identity instead of blanks/);
    expect(sql).toMatch(/got_name <> '' OR got_address <> '' OR got_phone <> ''/);
    // And it reports WHAT it found, so a failure names the value.
    expect(sql).toMatch(/name=% address=% phone=%/);
  });

  /**
   * The apply ORDER, and why it is a correctness property rather than tidiness.
   *
   * The trigger's `ON CONFLICT (shop_id)` needs the unique index to exist when
   * it RUNS. Created trigger-first inside one transaction that is invisible.
   * Applied separately — which is how this actually reached production — a
   * trigger with no matching constraint raises on EVERY insert into `shops`,
   * so signup stops working for everyone.
   *
   * The index therefore goes first, and the trigger, the statement that can
   * break signup, goes last.
   */
  it('creates the unique index before the trigger that depends on it', () => {
    const statements = sql.replace(/^\s*--.*$/gm, '');
    const index = statements.indexOf('CREATE UNIQUE INDEX');
    const trigger = statements.indexOf('CREATE TRIGGER');
    expect(index).toBeGreaterThan(-1);
    expect(trigger).toBeGreaterThan(-1);
    expect(index).toBeLessThan(trigger);
  });

  /**
   * The probe must not share a transaction with the repair.
   *
   * It did, and the probe failed, so the rollback took the repair with it.
   * Production afterwards: trigger 0, function 0, index 0 — nothing applied,
   * including the CREATE FUNCTION that ran first. A verification step that can
   * destroy what it verifies reports "migration failed" when the truth is
   * "migration was undone by its own test".
   */
  it('does not wrap the repair and the probe in one transaction', () => {
    const statements = sql.replace(/^\s*--.*$/gm, '');
    // A bare BEGIN;/COMMIT; is a transaction. plpgsql's own BEGIN (no
    // semicolon, inside $fn$/$probe$) is block structure and stays.
    expect(statements).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(statements).not.toMatch(/^\s*COMMIT;\s*$/m);
  });

  it('the probe removes what it creates on every exit path', () => {
    const probe = sql.slice(sql.indexOf('DO $probe$'));
    // Three RAISE EXCEPTION paths after the shop exists, plus the success
    // path: each must delete the probe shop before leaving.
    const raises = probe.match(/RAISE EXCEPTION/g) ?? [];
    const deletes = probe.match(/DELETE FROM public\.shops WHERE id = probe_shop/g) ?? [];
    // One RAISE is the insert failure, before any shop exists to clean up.
    expect(deletes.length).toBe(raises.length - 1 + 1);
  });

  it("and 'Redline' is not a name a shop can be ready with by default", () => {
    // The behavioural consequence, stated against the rule itself: a blank
    // name is missing however the blank arrived.
    expect(evaluateShopIdentity('s', { company_name: '', address: 'x', phone: 'y' }).ready).toBe(false);
  });
});
