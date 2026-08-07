/**
 * Two ways a vehicle record picked up or lost history it should not have.
 *
 * A manager created a fresh record for "Hyundai #3528" and found the Assigned
 * Techs already filled in with two names they had not entered, while every
 * other field stayed blank. And archiving appeared to lose information.
 *
 * The autofill: repair orders and job cards reference a vehicle by name, not by
 * id, so the lookup matched on the label — and for job cards it used a
 * *substring* match whenever the label was longer than four characters. The new
 * record was labelled "Hyundai", which matched every Hyundai in the shop and
 * pulled a different car's technicians in.
 *
 * The archive: the completed_at trigger added earlier the same day cleared the
 * date for any status that was not a completed one. Archived is not a completed
 * one, and Completed → Archived is the normal end of a job, so filing finished
 * work away would have dropped it out of every monthly report.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const view      = read('features/vehicles/VehiclesView.tsx');
const service   = read('services/vehicleService.ts');
const migration = read('supabase/migrations/2026-08-04_vehicles_completed_at_preserve_archive.sql');

describe('a vehicle only inherits its own history', () => {
  it('job cards match exactly, never by substring', () => {
    // `.includes(vLabel) && vLabel.length > 4` is what made "Hyundai" match
    // "Hyundai Elantra #6310".
    expect(view).not.toMatch(/toLowerCase\(\)\.includes\(vLabel\)/);
    expect(view).toMatch(/jc\.vehicle\?\.trim\(\)\.toLowerCase\(\) === vLabel/);
  });

  it('repair orders match exactly too', () => {
    expect(view).toMatch(/ro\.vehicle\?\.trim\(\)\.toLowerCase\(\) === vLabel/);
  });

  it('a match must not belong to another customer', () => {
    expect(view).toMatch(/const sameCustomer =/);
    expect(view).toMatch(/sameCustomer\(ro\.customerId\)/);
  });

  it('an empty label matches nothing rather than everything', () => {
    // An empty string is contained in every string, so a blank label used to
    // match every job card in the shop.
    expect(view).toMatch(/if \(!vLabel\) \{/);
    expect(view).toMatch(/there is nothing to match a Repair Order against/);
  });

  it('a record being created pulls nothing at all', () => {
    // A vehicle that does not exist yet has no history, so anything pulled in
    // belongs to a different car.
    expect(view).toMatch(/if \(vehicle\.id\) pullFromRO\(true\)/);
  });

  it('the manual Pull from RO button still exists', () => {
    // The operator can still ask for it deliberately; only the silent
    // guessing is removed.
    expect(view).toMatch(/Pull from RO/);
  });
});

describe('archiving preserves when the work was completed', () => {
  it('clears the date only for statuses that mean work resumed', () => {
    expect(migration).toMatch(/reopened constant text\[\] := array\[/);
    expect(migration).toMatch(/elsif lower\(coalesce\(new\.status, ''\)\) = any \(reopened\)/);
  });

  it('does not clear it for every non-completed status', () => {
    // The original rule. Archived fell into it, which is the bug.
    expect(migration).not.toMatch(/elsif not \(new\.status ilike '%complet%'\) then/);
  });

  it('lists the reopening statuses rather than the filing ones', () => {
    // A status added later then defaults to preserving history instead of
    // destroying it the first time someone uses it.
    for (const s of ['in progress', 'pending parts', 'pending approval', 'active', 'returned job']) {
      expect(migration).toContain(`'${s}'`);
    }
    expect(migration).not.toMatch(/'archived'/i);
  });

  it('still stamps the date on the transition into completed', () => {
    expect(migration).toMatch(/new\.completed_at := now\(\)/);
    expect(migration).toMatch(/old\.status is null or not \(old\.status ilike '%complet%'\)/);
  });

  it('checks the trigger it replaces the function for is still attached', () => {
    expect(migration).toMatch(/raise exception 'vehicles_stamp_completed_at is missing'/);
  });
});

describe('a vehicle save that writes nothing says so', () => {
  it('asks for the affected row count', () => {
    expect(service).toMatch(/\.update\(payload, \{ count: 'exact' \}\)/);
  });

  it('treats zero rows as a failure', () => {
    expect(service).toMatch(/The vehicle was not saved/);
  });

  it('checks the error first, so a real error surfaces as itself', () => {
    const fn = service.slice(service.indexOf('export async function updateVehicleServiceRecord'));
    expect(fn.indexOf('if (error) throw error')).toBeLessThan(fn.indexOf('if (count === 0)'));
  });
});
