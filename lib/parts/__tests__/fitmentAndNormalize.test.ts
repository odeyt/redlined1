/**
 * Fitment is the safety boundary, so it is tested as one.
 *
 * A wrong brake pad is not a bad search result — it is a vehicle that does not
 * stop. Every test here exists to stop `verified` being produced by anything
 * other than a provider stating compatibility with the vehicle asked about.
 */
import {
  fitmentFromEbayCompatibility, hasVehicleContext, describeVehicle,
  needsFitmentWarning, FITMENT_RANK,
} from '../fitment';
import { normalizeEbayItem, normalizeEbayResponse, safeText, safeHttpsUrl } from '../normalize';
import type { EbayItemSummary } from '../normalize';
import type { PartsSearchInput } from '../types';

const CHECKED_AT = '2026-08-23T00:00:00.000Z';
const TACOMA: PartsSearchInput = {
  query: 'front brake pads',
  year: 2019, make: 'Toyota', model: 'Tacoma', engine: '3.5L',
  currency: 'USD',
};
const NO_VEHICLE: PartsSearchInput = { query: 'front brake pads' };

describe('fitment can only be verified by a stated compatibility', () => {
  it('COMPATIBLE with a vehicle in hand is verified', () => {
    const v = fitmentFromEbayCompatibility('COMPATIBLE', {
      hasVehicleContext: true, vehicleLabel: '2019 Toyota Tacoma',
    });
    expect(v.status).toBe('verified');
    expect(v.reason).toContain('2019 Toyota Tacoma');
  });

  it('COMPATIBLE with NO vehicle is downgraded, not trusted', () => {
    // The verdict has nothing to be about. Accepting it would mean a search
    // with no vehicle details could produce "verified fit".
    expect(fitmentFromEbayCompatibility('COMPATIBLE', {
      hasVehicleContext: false, vehicleLabel: 'this vehicle',
    }).status).toBe('unverified');
  });

  it('NOT_COMPATIBLE is incompatible', () => {
    expect(fitmentFromEbayCompatibility('NOT_COMPATIBLE', {
      hasVehicleContext: true, vehicleLabel: 'x',
    }).status).toBe('incompatible');
  });

  it('UNDETERMINED is never verified', () => {
    expect(fitmentFromEbayCompatibility('UNDETERMINED', {
      hasVehicleContext: true, vehicleLabel: 'x',
    }).status).toBe('unverified');
  });

  it.each([undefined, null, '', 'possible', 'unknown', 'maybe', 'yes', 'true', 'compatible-ish'])(
    'refuses to read %p as verified',
    value => {
      const v = fitmentFromEbayCompatibility(value as string, {
        hasVehicleContext: true, vehicleLabel: 'x',
      });
      expect(v.status).not.toBe('verified');
    },
  );

  it('an MPN match without vehicle compatibility is LIKELY, not verified', () => {
    const v = fitmentFromEbayCompatibility('UNDETERMINED', {
      hasVehicleContext: true, vehicleLabel: 'x', hasMpnMatch: true,
    });
    expect(v.status).toBe('likely');
  });

  it('is case-insensitive about the provider verdict', () => {
    expect(fitmentFromEbayCompatibility('compatible', {
      hasVehicleContext: true, vehicleLabel: 'x',
    }).status).toBe('verified');
  });

  it('every non-verified status carries the warning', () => {
    expect(needsFitmentWarning('verified')).toBe(false);
    for (const s of ['likely', 'unverified', 'incompatible'] as const) {
      expect(needsFitmentWarning(s)).toBe(true);
    }
  });

  it('ranks fitment above nothing else', () => {
    expect(FITMENT_RANK.verified).toBeGreaterThan(FITMENT_RANK.likely);
    expect(FITMENT_RANK.likely).toBeGreaterThan(FITMENT_RANK.unverified);
    expect(FITMENT_RANK.unverified).toBeGreaterThan(FITMENT_RANK.incompatible);
  });
});

describe('vehicle context', () => {
  it('needs a VIN or year+make+model', () => {
    expect(hasVehicleContext(TACOMA)).toBe(true);
    expect(hasVehicleContext({ query: 'x', vin: 'JT3' })).toBe(true);
    expect(hasVehicleContext({ query: 'x', year: 2019, make: 'Toyota' })).toBe(false);
    expect(hasVehicleContext(NO_VEHICLE)).toBe(false);
  });

  it('describes the vehicle for the technician', () => {
    expect(describeVehicle(TACOMA)).toBe('2019 Toyota Tacoma 3.5L');
    expect(describeVehicle(NO_VEHICLE)).toBe('this vehicle');
  });
});

describe('marketplace text is untrusted input', () => {
  it('strips control characters', () => {
    expect(safeText('Brake' + String.fromCharCode(7) + ' Pad Set')).toBe('Brake Pad Set');
  });

  it('strips bidi overrides that let a title lie about itself', () => {
    // A title can DISPLAY as one thing and STORE another using these.
    const RLO = String.fromCharCode(0x202e);   // right-to-left override
    const ZWSP = String.fromCharCode(0x200b);  // zero-width space
    expect(safeText('Genuine' + RLO + ' Toyota')).toBe('Genuine Toyota');
    expect(safeText('a' + ZWSP + 'b')).toBe('a b');
  });

  it('does not eat ordinary letters', () => {
    // A regression guard: an earlier version had /s+/ instead of /\s+/ and
    // would have removed every "s".
    expect(safeText('Brakes and shoes')).toBe('Brakes and shoes');
  });

  it('bounds the length', () => {
    const long = 'x'.repeat(500);
    const out = safeText(long, 100)!;
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns undefined for non-strings and empties', () => {
    expect(safeText(undefined)).toBeUndefined();
    expect(safeText(42)).toBeUndefined();
    expect(safeText('   ')).toBeUndefined();
  });
});

describe('provider URLs are allow-listed, not sanitised', () => {
  it('accepts https', () => {
    expect(safeHttpsUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it.each([
    'javascript:alert(1)',
    'http://example.com',
    'data:text/html,<script>',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'not a url',
  ])('rejects %s', bad => {
    expect(safeHttpsUrl(bad)).toBeUndefined();
  });
});

describe('normalising an eBay item', () => {
  const base: EbayItemSummary = {
    itemId: 'v1|123|0',
    title: 'Akebono ProACT ACT976 Front Brake Pads',
    brand: 'Akebono',
    mpn: 'ACT976',
    image: { imageUrl: 'https://i.ebayimg.com/x.jpg' },
    itemWebUrl: 'https://www.ebay.com/itm/123',
    price: { value: '64.95', currency: 'USD' },
    shippingOptions: [{
      shippingCost: { value: '8.00', currency: 'USD' },
      minEstimatedDeliveryDate: '2026-09-02T00:00:00.000Z',
      maxEstimatedDeliveryDate: '2026-09-05T00:00:00.000Z',
    }],
    condition: 'New',
    seller: { username: 'partsdepot', feedbackPercentage: '98.6' },
    compatibilityMatch: 'COMPATIBLE',
  };

  // Non-null here: every case below supplies a title. The titleless case is
  // exercised separately, straight through normalizeEbayItem.
  const norm = (over: Partial<EbayItemSummary> = {}, input = TACOMA) =>
    normalizeEbayItem({ ...base, ...over }, input, { checkedAt: CHECKED_AT })!;

  it('maps the fields the UI needs', () => {
    const r = norm()!;
    expect(r.provider).toBe('ebay');
    expect(r.providerListingId).toBe('v1|123|0');
    expect(r.brand).toBe('Akebono');
    expect(r.manufacturerPartNumber).toBe('ACT976');
    expect(r.itemPrice).toBe(64.95);
    expect(r.shippingCost).toBe(8);
    expect(r.currency).toBe('USD');
    expect(r.sourceCheckedAt).toBe(CHECKED_AT);
  });

  it('computes landed cost and marks it partial', () => {
    const r = norm()!;
    expect(r.landedCost).toBe(72.95);
    // Tax and duty are genuinely unknown from a Browse response.
    expect(r.estimatedTax).toBeNull();
    expect(r.estimatedImportDuty).toBeNull();
    expect(r.landedCostCompleteness).toBe('partial');
  });

  it('normalises seller feedback to 0–1', () => {
    expect(norm().sellerRating).toBeCloseTo(0.986, 4);
    expect(norm({ seller: { username: 'x', feedbackPercentage: 'n/a' } }).sellerRating).toBeUndefined();
  });

  it('keeps free shipping as zero, not unknown', () => {
    // The distinction matters: free shipping makes a landed cost COMPLETE for
    // shipping, whereas no shipping data at all does not.
    const r = norm({ shippingOptions: [{ shippingCost: { value: '0' } }] })!;
    expect(r.shippingCost).toBe(0);
    expect(r.landedCost).toBe(64.95);
  });

  it('treats absent shipping as unknown rather than zero', () => {
    const r = norm({ shippingOptions: undefined })!;
    expect(r.shippingCost).toBeUndefined();
    expect(r.landedCost).toBe(64.95); // item only
    expect(r.landedCostCompleteness).toBe('partial');
  });

  it('survives a missing image', () => {
    expect(norm({ image: undefined }).imageUrl).toBeUndefined();
  });

  it('drops a hostile image URL instead of rendering it', () => {
    expect(norm({ image: { imageUrl: 'javascript:alert(1)' } }).imageUrl).toBeUndefined();
  });

  it('drops a result with no title rather than showing an empty card', () => {
    expect(normalizeEbayItem({ ...base, title: undefined }, TACOMA, { checkedAt: CHECKED_AT }))
      .toBeNull();
  });

  it('carries an incompatible verdict through', () => {
    const r = norm({ compatibilityMatch: 'NOT_COMPATIBLE' })!;
    expect(r.fitmentStatus).toBe('incompatible');
  });

  it('does not upgrade fitment when the search had no vehicle', () => {
    expect(norm({}, NO_VEHICLE).fitmentStatus).toBe('unverified');
  });

  it('falls back to the requested currency when the price has none', () => {
    const r = norm({ price: { value: '10' } }, { ...TACOMA, currency: 'THB' })!;
    expect(r.currency).toBe('THB');
  });

  it('filters unusable rows out of a whole response', () => {
    const out = normalizeEbayResponse(
      { itemSummaries: [base, { ...base, title: undefined }] },
      TACOMA, { checkedAt: CHECKED_AT },
    );
    expect(out).toHaveLength(1);
  });

  it('handles a malformed payload without throwing', () => {
    expect(normalizeEbayResponse(null, TACOMA, { checkedAt: CHECKED_AT })).toEqual([]);
    expect(normalizeEbayResponse({}, TACOMA, { checkedAt: CHECKED_AT })).toEqual([]);
  });
});
