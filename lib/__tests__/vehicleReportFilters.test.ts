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
  /**
   * These three used to assert the inline implementation here — the shape of
   * `reportDate`, the year comparison, the NaN guard. They matched source
   * text, so they passed while the surrounding predicate was letting every
   * open job through, which is the bug the owner reported.
   *
   * The rule now lives in `lib/vehicles/reportMonth.ts` and is proven by
   * RUNNING it in `lib/vehicles/__tests__/reportMonth.test.ts`, against the
   * actual rows from that screenshot. What is left to check here is that the
   * view uses the shared rule rather than growing a private copy that can
   * drift from it.
   */
  it('uses the shared month rule rather than its own copy', () => {
    expect(view).toContain("from '@/lib/vehicles/reportMonth'");
    expect(view).toMatch(/matchesReportMonth\(v, monthFilter, yearFilter\)/);
    expect(view).toMatch(/isCompletedStatus\(v\.status\)/);
  });

  it('keeps no second date rule inline', () => {
    // A local re-implementation is how the two would diverge silently.
    expect(view).not.toMatch(/d\.getFullYear\(\) === yearFilter/);
    expect(view).not.toMatch(/const reportDate = /);
  });

  /**
   * REVERSED, deliberately, and the old reasoning is kept here because it was
   * not wrong — it was just outweighed.
   *
   * It used to read: "narrows only completed vehicles, so open work stays
   * visible", on the grounds that a month filter hiding live jobs would make
   * the page useless for running the floor today.
   *
   * What that produced in production: selecting August returned cars received
   * in March and July, sitting at In Progress and Pending Approval, under a
   * control labelled COMPLETED IN. The owner reported it as broken, and by
   * the label it was — 67 rows came back where 18 were completed in the month
   * asked for.
   *
   * The floor view is not lost, because it is the DEFAULT. "Any month" is the
   * starting state; choosing a month is an explicit reporting action and
   * clearing it restores the live list.
   */
  it('shows only vehicles completed in the selected month', () => {
    expect(view).toMatch(/if \(monthFilter && !\(isCompleted\(v\) && inSelectedMonth\(v\)\)\) return false;/);
  });

  it('does not let an open job through on its arrival date', () => {
    // The precise regression: the old predicate tested `isCompleted(v) &&
    // !inSelectedMonth(v)`, which is false for every open job, so every open
    // job passed. Banned by shape, not by comment.
    expect(view).not.toMatch(/monthFilter && isCompleted\(v\) && !inSelectedMonth\(v\)/);
  });

  it('tells the operator that a month means completed work only', () => {
    // Otherwise the open-status chips reading zero becomes the next bug
    // report. The message also names the way back.
    expect(view).toContain('Completed work only — clear the month to see live jobs');
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
