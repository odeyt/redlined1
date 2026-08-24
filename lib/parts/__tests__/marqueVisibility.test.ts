/**
 * The marque has to reach the screen.
 *
 * Staging showed a Toyota OEM number searched against a 2014 Mercedes-Benz
 * S-Class. Every row came back UNVERIFIED — safe — but the card gave no way
 * to see which marque each row was filed under, and the reason shown was the
 * generic "the catalogue lists no vehicle applicability for this part
 * number".
 *
 * Both statements were true. The useful one had been computed and thrown
 * away: `normalize()` works out that a row is filed under CHRYSLER while the
 * estimate is a Mercedes, and `buildVerdict()` overwrote that reason with its
 * own. Nothing was unsafe; the technician simply could not see the single
 * fact that tells them to move on.
 */
import { normalizeAutoPartsArticle } from '../providers/autopartsapi/normalize';
import { marqueMatchesVehicle } from '../../../features/estimates/PartsSearchModal';
import type { AutoPartsArticle } from '../providers/autopartsapi/types';
import type { PartsSearchInput } from '../types';

const CHECKED_AT = '2026-08-24T00:00:00.000Z';
const OEM = '04465-0K340';

const MERCEDES: PartsSearchInput = {
  query: OEM, oemNumber: OEM, make: 'Mercedes-Benz', model: 'S-Class', year: 2014,
};
const TOYOTA: PartsSearchInput = {
  query: OEM, oemNumber: OEM, make: 'Toyota', model: 'Tacoma', year: 2019,
};

const row = (manufacturerName: string): AutoPartsArticle => ({
  articleId: 1,
  articleSearchNo: OEM,
  articleNo: '0 986 495 302',
  articleProductName: 'Brake Pad Set, disc brake',
  manufacturerName,
  supplierName: 'BOSCH',
});

const norm = (marque: string, input: PartsSearchInput) =>
  normalizeAutoPartsArticle(row(marque), input, { checkedAt: CHECKED_AT })!;

describe('the marque travels with the result', () => {
  it('is exposed separately from the brand', () => {
    const r = norm('TOYOTA', TOYOTA);
    // supplierName is the brand; manufacturerName is the marque. Conflating
    // them would print "TOYOTA" on a line for a BOSCH pad.
    expect(r.brand).toBe('BOSCH');
    expect(r.vehicleManufacturer).toBe('TOYOTA');
  });

  it('is present even when the marque disagrees with the estimate', () => {
    // The disagreeing case is exactly the one worth showing.
    expect(norm('CHRYSLER', MERCEDES).vehicleManufacturer).toBe('CHRYSLER');
  });
});

describe('marque comparison is exact, never similar', () => {
  it('ignores punctuation and case only', () => {
    expect(marqueMatchesVehicle('MERCEDES-BENZ', 'Mercedes Benz')).toBe(true);
    expect(marqueMatchesVehicle('TOYOTA', 'Toyota')).toBe(true);
    expect(marqueMatchesVehicle('Land Rover', 'LAND-ROVER')).toBe(true);
  });

  it('refuses related marques', () => {
    // Toyota and Lexus are the same company and different parts catalogues.
    expect(marqueMatchesVehicle('LEXUS', 'Toyota')).toBe(false);
    expect(marqueMatchesVehicle('CHRYSLER', 'Mercedes-Benz')).toBe(false);
    expect(marqueMatchesVehicle('FORD', 'Toyota')).toBe(false);
  });

  it('refuses a partial or prefix overlap', () => {
    // No similarity scoring. "MERCEDES" is not "MERCEDES-BENZ" here, and a
    // substring rule would happily match half a marque.
    expect(marqueMatchesVehicle('MERC', 'Mercedes-Benz')).toBe(false);
  });

  it('is false when either side is unknown', () => {
    expect(marqueMatchesVehicle(undefined, 'Toyota')).toBe(false);
    expect(marqueMatchesVehicle('TOYOTA', undefined)).toBe(false);
  });
});

describe('a mismatched marque says so, and never claims fit', () => {
  it('names both marques in the reason', () => {
    const r = norm('CHRYSLER', MERCEDES);
    expect(r.fitmentReason).toContain('CHRYSLER');
    expect(r.fitmentReason).toContain('Mercedes-Benz');
    expect(r.fitmentReason).toContain('collide across marques');
  });

  it('stays unverified whatever the digits say', () => {
    // The OEM number matches exactly. The marque does not.
    expect(norm('CHRYSLER', MERCEDES).fitmentStatus).toBe('unverified');
    expect(norm('FORD', MERCEDES).fitmentStatus).toBe('unverified');
  });

  it('a matching marque with a matching number reaches likely, never verified', () => {
    const r = norm('TOYOTA', TOYOTA);
    expect(r.fitmentStatus).toBe('likely');
    // Only vehicle applicability can produce `verified`, and this endpoint
    // does not provide it.
    expect(r.fitmentStatus).not.toBe('verified');
  });
});

describe('the card shows it', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const MODAL = fs.readFileSync(
    path.join(process.cwd(), 'features', 'estimates', 'PartsSearchModal.tsx'), 'utf8');

  it('renders the marque on every catalogue row', () => {
    expect(MODAL).toContain('data-testid="row-marque"');
    expect(MODAL).toContain('r.vehicleManufacturer');
  });

  it('marks a disagreeing marque visibly', () => {
    // A quiet grey label would be missed. The mismatch carries its own glyph
    // and colour so it reads at a glance on a list of 277 rows.
    expect(MODAL).toContain("'≠ '");
    expect(MODAL).toContain('marqueMatchesVehicle(r.vehicleManufacturer, vehicle.make)');
  });

  it('keeps the marque-specific reason rather than the generic one', () => {
    const PROVIDER = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'parts', 'providers', 'autopartsapi', 'provider.ts'), 'utf8');
    expect(PROVIDER).toContain('marqueMismatch');
    expect(PROVIDER).toContain('article.fitmentReason');
  });
});
