/**
 * Three fixes reported together from the shop floor.
 *
 * 1. Technicians listed twice on a job card. Someone who works at both
 *    locations has a technician row per shop; the create form already deduped
 *    with uniqueTechsByPerson but the inline row editor used the raw list, so
 *    every name appeared twice — and ticking one left its twin unticked.
 *
 * 2. "Once something is created, right away I should be able to see that
 *    something was created. We should not have to scroll upward." New records
 *    are prepended, so they land at the top of the list, but the create form
 *    is long and closing it leaves you scrolled past both the confirmation
 *    and the new row.
 *
 * 3. Loaders that swallowed their errors. When the customer fetch failed the
 *    dropdown was simply empty with nothing on screen explaining why, which
 *    presents as "the customer name won't register".
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const jobCards = strip(readFileSync(join(root, 'features', 'job-cards', 'JobCardsView.tsx'), 'utf8'));
const inspections = strip(readFileSync(join(root, 'features', 'inspections', 'InspectionsView.tsx'), 'utf8'));

describe('technicians are listed once per person', () => {
  it('the inline job-card editor uses the deduped list', () => {
    expect(jobCards).not.toMatch(/\{techs\.map\(t => \(\s*<label/);
    expect(jobCards).toMatch(/\{uniqueTechs\.map\(t => \(/);
  });

  it('the headcount counts people, not shop rows', () => {
    expect(jobCards).toMatch(/label="Technicians"[\s\S]{0,120}value=\{String\(uniqueTechs\.length\)\}/);
  });
});

describe('a created record is visible immediately', () => {
  it.each([
    ['job cards', () => jobCards],
    ['inspections', () => inspections],
  ])('%s reveals the top of the list after a successful create', (_name, get) => {
    expect(get()).toMatch(/revealNewRecord\(\)/);
  });

  it('only after the record is actually in the list', () => {
    // Scrolling before the state update would land on the old first row.
    const src = jobCards;
    expect(src.indexOf('setJobs(prev => [job, ...prev])'))
      .toBeLessThan(src.indexOf('revealNewRecord()'));
  });

  it('not on the failure path', () => {
    // Nothing was created, so there is nothing to reveal — and moving the
    // viewport would hide the error message.
    const afterCatch = jobCards.slice(jobCards.indexOf('catch (err: unknown)'));
    expect(afterCatch).not.toMatch(/revealNewRecord\(\)/);
  });
});

describe('loaders report their failures', () => {
  it('the customer list no longer fails silently', () => {
    expect(inspections).not.toMatch(/fetchCustomers\(\)\.then\(setCustomers\)\.catch\(\(\) => \{\}\)/);
    expect(inspections).toMatch(/Could not load customers/);
  });

  it('the vehicle list no longer fails silently', () => {
    expect(inspections).not.toMatch(/fetchVehicles\(\)\.then\(setAllVehicles\)\.catch\(\(\) => \{\}\)/);
    expect(inspections).toMatch(/Could not load vehicles/);
  });
});
