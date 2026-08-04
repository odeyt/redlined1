/**
 * Carrying the intake's work into the inspection it becomes.
 *
 * A trial shop ran Vehicle Intake, captured the complaint, scored 85% on data
 * quality, and pressed "Send to Inspection". The DVI opened with no customer,
 * no vehicle, no VIN — everything had to be typed again — and the sidebar
 * still read Customers 0, Vehicles 0.
 *
 * Three separate causes, none of which announced itself:
 *
 * 1. Both completion paths called saveVehicle() inside a bare `catch {}`. When
 *    it failed the error was discarded, so the records silently never appeared.
 * 2. vehicleId was collected by the intake form and then never read, so
 *    picking an existing vehicle created a second copy of it every time.
 * 3. The hand-off dispatched SET_MODULE with no prefill, so the module opened
 *    on a blank editor with the freshly created inspection nowhere in sight.
 *
 * VIN was never captured at all, which is why the DVI's "auto-filled from
 * vehicle" field had nothing to fill from.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const triage      = read('features/triage/TriageView.tsx');
const vehicleStep = read('features/triage/steps/VehicleStep.tsx');
const inspections = read('features/inspections/InspectionsView.tsx');
const inspSvc     = read('services/inspectionService.ts');
const types       = read('lib/triage/QuestionTypes.ts');

describe('an existing vehicle is reused, not copied', () => {
  it('the helper returns early when the intake already has a vehicle', () => {
    expect(triage).toMatch(/if \(vehicle\.vehicleId\) \{[\s\S]*?return \{ customerId, vehicleId: vehicle\.vehicleId/);
  });

  it('no completion path calls saveVehicle directly any more', () => {
    // Two call sites drifted apart — one passed make/model/year, the other
    // did not, so the same car got different records depending on the button.
    const calls = triage.match(/await saveVehicle\(/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it('both hand-offs go through the one helper', () => {
    const uses = triage.match(/ensureCustomerAndVehicle\(session\.vehicle\)/g) ?? [];
    expect(uses.length).toBe(2);
  });
});

describe('a failure to save is reported, not swallowed', () => {
  it('the bare catch around vehicle creation is gone', () => {
    expect(triage).not.toMatch(/catch \{ \/\* non-fatal/);
  });

  it('ensureCustomerId lets its error propagate', () => {
    expect(triage).not.toMatch(/return ''; \/\/ non-fatal/);
  });

  it('the job card path stops and says what failed', () => {
    expect(triage).toMatch(/Could not save the customer or vehicle: \$\{/);
  });

  it('the inspection path names the error instead of a generic message', () => {
    expect(triage).toMatch(/Failed to create inspection: \$\{e instanceof Error \? e\.message/);
  });
});

describe('the vehicle is identified, not re-keyed', () => {
  it('the intake record can hold a VIN and plate', () => {
    expect(types).toMatch(/vin\?: string;/);
    expect(types).toMatch(/plate\?: string;/);
  });

  it('selecting a vehicle carries them over', () => {
    expect(vehicleStep).toMatch(/vehicleId: v\.id, vin: v\.vin, plate: v\.plate/);
  });

  it('the query actually asks for the VIN', () => {
    // The field existed on the record and was absent from the select, so it
    // was always undefined.
    expect(vehicleStep).toMatch(/transmission, plate, vin'\)/);
  });

  it('the inspection is built with it rather than a hardcoded blank', () => {
    expect(inspSvc).toMatch(/vin: session\.vehicle\.vin \?\? ''/);
    expect(inspSvc).not.toMatch(/vehicle,\s*\n\s*vin: '',/);
  });

  it('customer and vehicle resolve before the inspection is built', () => {
    // Building it first would bake in the blanks the resolution fills.
    // Scoped to the handler: `createInspectionFromTriage` also appears in the
    // import list, which sits above everything and would always match first.
    const handler = triage.slice(triage.indexOf('const handleSendToInspection'));
    expect(handler.indexOf('await ensureCustomerAndVehicle(session.vehicle)'))
      .toBeLessThan(handler.indexOf('createInspectionFromTriage('));
  });
});

describe('the inspection it just created is the one that opens', () => {
  it('the hand-off sends the new inspection id', () => {
    expect(triage).toMatch(/inspectionId: \(created as \{ id\?: string \}\)\?\.id \?\? ''/);
  });

  it('the module opens that record instead of a blank form', () => {
    expect(inspections).toMatch(/if \(!prefill\?\.inspectionId\) return;/);
    expect(inspections).toMatch(/setSelected\(found\)/);
  });

  it('waits for the list rather than giving up when it is not loaded', () => {
    expect(inspections).toMatch(/if \(!found\) return; \/\/ list not loaded yet/);
  });

  it('the create-new path stands down when an id is supplied', () => {
    // Otherwise one intake becomes two DVIs — the created one and a new blank.
    expect(inspections).toMatch(/if \(!prefill \|\| prefill\.inspectionId\) return;/);
  });

  it('a prefilled VIN reaches the form on the create-new path too', () => {
    expect(inspections).toMatch(/vin: prefill\.vin \?\? ''/);
  });
});
