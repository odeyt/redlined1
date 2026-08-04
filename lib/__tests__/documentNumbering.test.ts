/**
 * Document numbers must be unique within a shop.
 *
 * Production has RO-00024 on a Hilux Tiger and a Hilux Vigo, and RO-00003 on a
 * BMW X6 and a Nissan Navara at the other shop. Both are the same defect: every
 * generator read the table and added one, with nothing holding a lock between
 * the read and the insert.
 *
 * The COUNT-based generators (repair orders, estimates) failed a second way that
 * needs no concurrency at all — deleting a row lowers the count, so the next
 * document reuses a number that is still on a document.
 *
 * Allocation now happens inside Postgres under a row lock. These tests pin the
 * properties that make that true; the lock itself is the database's job.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/2026-08-04_document_counters.sql');
const selfSeed  = read('supabase/migrations/2026-08-04_document_counters_self_seed.sql');
const helper    = read('services/documentNumberService.ts');
const services  = {
  repairOrder: read('services/repairOrderService.ts'),
  estimate:    read('services/estimateService.ts'),
  invoice:     read('services/invoiceService.ts'),
  inspection:  read('services/inspectionService.ts'),
};

describe('nobody counts rows any more', () => {
  it('no generator derives a number from a row count', () => {
    // COUNT(*) + 1 reissues a number the moment anything is deleted.
    for (const [name, src] of Object.entries(services)) {
      expect(`${name}: ${/count: 'exact', head: true/.test(src)}`).toBe(`${name}: false`);
    }
  });

  it('no generator derives a number from the client-side max', () => {
    for (const [name, src] of Object.entries(services)) {
      expect(`${name}: ${/Math\.max\(\.\.\.nums\)/.test(src)}`).toBe(`${name}: false`);
    }
  });

  it('all four go through the one shared allocator', () => {
    expect(services.repairOrder).toMatch(/return nextDocumentNumber\('repair_order'\)/);
    expect(services.estimate).toMatch(/return nextDocumentNumber\('estimate'\)/);
    expect(services.invoice).toMatch(/return nextDocumentNumber\('invoice'\)/);
    expect(services.inspection).toMatch(/return nextDocumentNumber\('inspection'\)/);
  });
});

describe('the database allocates, atomically', () => {
  it('the helper calls the function rather than querying the table', () => {
    expect(helper).toMatch(/supabase\.rpc\('next_document_number'/);
    expect(helper).not.toMatch(/\.from\('document_counters'\)/);
  });

  it('the increment and the read are one statement', () => {
    // Two statements would leave the same gap the old code had.
    expect(migration).toMatch(/on conflict \(shop_id, doc_type\) do update/);
    expect(migration).toMatch(/returning last_value into v/);
  });

  it('a failed allocation stops the save instead of guessing', () => {
    // A local fallback would reintroduce the duplicate this prevents.
    expect(helper).toMatch(/throw new Error\(`Could not allocate/);
    expect(helper).not.toMatch(/catch/);
  });

  it('refuses to allocate with no active shop', () => {
    expect(helper).toMatch(/No active shop/);
  });
});

describe('existing numbers are not reissued', () => {
  it('counters are seeded before anything can allocate', () => {
    expect(migration.indexOf('insert into public.document_counters')).toBeLessThan(
      migration.indexOf('create or replace function public.next_document_number'),
    );
  });

  it('seeds from the highest number issued, not the row count', () => {
    // A shop that deleted an order has fewer rows than its highest number.
    expect(migration).toMatch(/max\(nullif\(regexp_replace\(ro_number/);
    const seeds = migration.slice(
      migration.indexOf('insert into public.document_counters'),
      migration.indexOf('create or replace function'),
    );
    expect(seeds).not.toMatch(/count\(/i);
    expect((seeds.match(/coalesce\(max\(/g) ?? []).length).toBe(4);
  });

  it('seeds all four document types', () => {
    for (const t of ['repair_order', 'estimate', 'invoice', 'inspection']) {
      expect(migration).toMatch(new RegExp(`'${t}',`));
    }
  });

  it('is safe to run twice', () => {
    expect(migration).toMatch(/create table if not exists/);
    expect((migration.match(/on conflict \(shop_id, doc_type\) do nothing/g) ?? []).length).toBe(4);
  });
});

/**
 * The first seed covered 3 of the 9 rows the data needs. That mattered because
 * the function inserted last_value=1 when it found no counter row — so the next
 * invoice at a shop with 28 of them would have been allocated INV-0001.
 *
 * A fix for duplicates that issues duplicates is worse than no fix, so the
 * function no longer trusts the seed.
 */
describe('a missing counter cannot restart numbering at one', () => {
  it('derives the starting point from the source table', () => {
    expect(selfSeed).toMatch(/if not exists \(\s*select 1 from public\.document_counters/);
    expect(selfSeed).toMatch(/v_seed := case p_doc_type/);
  });

  it('seeds from every source table, by shop', () => {
    for (const t of ['repair_orders', 'estimates', 'invoices', 'inspections']) {
      expect(selfSeed).toMatch(new RegExp(`from public\\.${t} where shop_id = p_shop_id`));
    }
  });

  it('seeds from the highest issued, not the row count', () => {
    expect((selfSeed.match(/coalesce\(max\(/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(selfSeed).not.toMatch(/count\(\*\)/i);
  });

  it('a losing racer does not overwrite the seed already written', () => {
    // DO UPDATE here would let a second caller rewind the counter.
    expect(selfSeed).toMatch(/values \(p_shop_id, p_doc_type, coalesce\(v_seed, 0\)\)\s*\n\s*on conflict \(shop_id, doc_type\) do nothing/);
  });

  it('still checks membership before it can seed anything', () => {
    expect(selfSeed.indexOf('not a member of shop')).toBeLessThan(selfSeed.indexOf('v_seed :='));
  });

  it('reloads the API schema cache, which DDL alone does not', () => {
    // Without this the app gets 404 from PostgREST and every save fails.
    expect(selfSeed).toMatch(/notify pgrst, 'reload schema'/);
  });
});

describe('the format each document already uses is preserved', () => {
  it('keeps the prefixes and widths, so nothing renumbers', () => {
    expect(helper).toMatch(/repair_order: \{ prefix: 'RO-',\s+width: 5 \}/);
    expect(helper).toMatch(/estimate:\s+\{ prefix: 'EST-', width: 4 \}/);
    expect(helper).toMatch(/invoice:\s+\{ prefix: 'INV-', width: 4 \}/);
    expect(helper).toMatch(/inspection:\s+\{ prefix: 'DVI-', width: 4 \}/);
  });

  it('pads to the declared width', () => {
    expect(helper).toMatch(/padStart\(width, '0'\)/);
  });
});

describe('one shop cannot touch another shop\'s numbering', () => {
  it('membership is checked, since definer rights bypass RLS', () => {
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/from public\.shop_users\s+where shop_id = p_shop_id and user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/raise exception 'not a member of shop/);
  });

  it('pins search_path, so the membership check cannot be shadowed', () => {
    expect(migration).toMatch(/set search_path = public/);
  });

  it('rejects a document type it does not know', () => {
    expect(migration).toMatch(/raise exception 'unknown document type/);
  });

  it('the counter table itself is unreachable from the client', () => {
    // Rewinding a counter would let a client reissue a live number.
    expect(migration).toMatch(/revoke all on public\.document_counters from authenticated, anon/);
    expect(migration).toMatch(/enable row level security/);
  });

  it('creates no policy on the counter table, so RLS denies by default', () => {
    expect(migration).not.toMatch(/create policy/i);
  });

  it('asserts RLS actually enabled rather than assuming it', () => {
    expect(migration).toMatch(/RAISE EXCEPTION 'RLS did not enable on document_counters'/i);
  });

  it('grants anon nothing', () => {
    expect(migration).toMatch(/revoke execute on function public\.next_document_number\(uuid, text\) from anon/);
  });

  it('revokes PUBLIC, which is what actually holds the default grant', () => {
    // Postgres grants EXECUTE to PUBLIC on every new function, so revoking
    // anon alone leaves it callable. Verified live: an anon call reached the
    // function body and was stopped only by the membership check.
    expect(selfSeed).toMatch(/revoke execute on function public\.next_document_number\(uuid, text\) from public/);
  });

  it('re-grants authenticated after the revoke, not before', () => {
    // Revoking PUBLIC after granting authenticated would be fine, but the
    // reverse order is what makes the intent readable and the result certain.
    expect(selfSeed.indexOf('from public;')).toBeLessThan(
      selfSeed.indexOf('grant  execute on function'),
    );
  });
});
