/**
 * Filtering Vehicle Management by location and completion month.
 *
 * D1 Imports runs two locations and mirrors them into one list, so every count
 * on the page — 53 vehicles, 18 completed — spanned both shops with no way to
 * separate them. A report for "the shop" was always a report for both.
 *
 * The month side was wrong for a second, independent reason: vehicles record
 * date_received and nothing else, and the existing completion report filtered
 * on it. A car booked in on 28 June and finished on 3 July counted towards June
 * and was missing from July. Every month was wrong by however much work crossed
 * a month boundary.
 *
 * So this adds a real completion date and filters on that, and is explicit
 * where it cannot — the vehicles finished before the column existed can only be
 * dated by arrival, and the UI labels them rather than quietly mixing them in.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const view      = read('features/vehicles/VehiclesView.tsx');
const service   = read('services/vehicleService.ts');
const migration = read('supabase/migrations/2026-08-04_vehicles_completed_at.sql');

describe('a location can be singled out of the mirror', () => {
  it('the record carries which shop it belongs to', () => {
    // select('*') always returned shop_id; the mapping dropped it, so the UI
    // had nothing to filter on.
    expect(service).toMatch(/shopId:\s+row\.shop_id \?\? ''/);
  });

  it('the list filters on it', () => {
    expect(view).toMatch(/if \(shopFilter && v\.shopId !== shopFilter\) return false;/);
  });

  it('defaults to all locations, preserving what the page did before', () => {
    expect(view).toMatch(/useState\(''\); *\n?/);
    expect(view).toMatch(/<option value="">All locations<\/option>/);
  });

  it('only offers the control when there is more than one location', () => {
    expect(view).toMatch(/\{shops\.length > 1 && \(/);
  });
});

describe('completion month filters on when work finished', () => {
  it('prefers the completion date over the arrival date', () => {
    expect(view).toMatch(/const reportDate = \(v: VehicleRecord\) => \(isCompleted\(v\) \? v\.completedAt : null\) \?\? v\.dateReceived;/);
  });

  it('matches both month and year, not month alone', () => {
    // Month-only would merge July 2025 into July 2026.
    expect(view).toMatch(/d\.getFullYear\(\) === yearFilter && d\.getMonth\(\) \+ 1 === monthFilter/);
  });

  it('survives an unparseable date instead of throwing', () => {
    expect(view).toMatch(/Number\.isNaN\(d\.getTime\(\)\)/);
  });

  it('narrows only completed vehicles, so open work stays visible', () => {
    // A month filter that hid live jobs would make the page useless for its
    // primary purpose, which is running the floor today.
    expect(view).toMatch(/if \(monthFilter && isCompleted\(v\) && !inSelectedMonth\(v\)\) return false;/);
  });
});

describe('the counts agree with the rows', () => {
  it('chips count the same scoped set the list draws from', () => {
    expect(view).toMatch(/counts: Record<string, number> = \{ All: scoped\.filter/);
    expect(view).toMatch(/scoped\.forEach\(v => \{ counts\[v\.status\]/);
    expect(view).not.toMatch(/vehicles\.forEach\(v => \{ counts\[v\.status\]/);
  });
});

describe('it is honest about dates it does not have', () => {
  it('counts completed vehicles with no completion date', () => {
    expect(view).toMatch(/completedMissingDate = scoped\.filter\(v => isCompleted\(v\) && !v\.completedAt\)/);
  });

  it('says so on screen when a month is selected', () => {
    expect(view).toMatch(/dated by arrival, not completion/);
  });

  it('explains why in the tooltip rather than only flagging it', () => {
    expect(view).toMatch(/completed before a completion date was recorded/);
  });
});

describe('the completion date is recorded going forward', () => {
  it('a trigger stamps it when the status becomes completed', () => {
    expect(migration).toMatch(/before insert or update of status on public\.vehicles/);
    expect(migration).toMatch(/new\.completed_at := now\(\)/);
  });

  it('only stamps on the transition into completed, not on every save', () => {
    // Re-stamping on an unrelated edit would move a finished job into the
    // month someone happened to correct a typo.
    expect(migration).toMatch(/old\.status is null or not \(old\.status ilike '%complet%'\)/);
  });

  it('clears the date when a vehicle is reopened', () => {
    // A stale date would count the car in two months at once.
    expect(migration).toMatch(/elsif not \(new\.status ilike '%complet%'\) then\s*\n\s*new\.completed_at := null;/);
  });

  it('does not backfill arrival dates into it', () => {
    // That would reproduce the exact error being removed, and afterwards be
    // indistinguishable from a real completion date.
    expect(migration).toMatch(/Deliberately no backfill/);
    expect(migration).not.toMatch(/set completed_at = date_received/i);
  });

  it('is safe to run twice', () => {
    expect(migration).toMatch(/add column if not exists completed_at/);
    expect(migration).toMatch(/drop trigger if exists vehicles_stamp_completed_at/);
  });

  it('asserts the trigger attached rather than assuming it', () => {
    expect(migration).toMatch(/raise exception 'vehicles_stamp_completed_at did not attach'/);
  });
});
