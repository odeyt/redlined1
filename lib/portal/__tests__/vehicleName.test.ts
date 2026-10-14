/**
 * The portal's vehicle heading. Reported 2026-10-14: the walkthrough vehicle
 * (named in `label`, year/make/model empty) showed only its plate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { vehicleName } from '../vehicleName';

const blank = { label: '', year: '', make: '', model: '' };

describe('vehicleName', () => {
  it('uses the staff label first', () => {
    expect(vehicleName({ ...blank, label: '2020 Toyota Corolla PORTAL QA' })).toBe('2020 Toyota Corolla PORTAL QA');
    expect(vehicleName({ label: 'Fleet van #3', year: '2019', make: 'Ford', model: 'Transit' })).toBe('Fleet van #3');
  });

  it('falls back to year/make/model, skipping blanks', () => {
    expect(vehicleName({ ...blank, year: '2018', make: 'Ford', model: 'Ranger' })).toBe('2018 Ford Ranger');
    expect(vehicleName({ ...blank, make: 'Honda' })).toBe('Honda');
    expect(vehicleName({ ...blank, label: '   ', model: 'Civic' })).toBe('Civic');
  });

  it('is never blank', () => {
    expect(vehicleName(blank)).toBe('Vehicle');
    expect(vehicleName({ label: null as unknown as string, year: null as unknown as string, make: '', model: '' })).toBe('Vehicle');
  });

  it('is what the portal renders as the vehicle heading', () => {
    const client = fs.readFileSync(path.join(process.cwd(), 'app/portal/[token]/PortalClient.tsx'), 'utf8');
    expect(client).toMatch(/\{vehicleName\(v\)\}/);
    expect(client).not.toMatch(/\{v\.year\} \{v\.make\} \{v\.model\}/);
  });
});
