/**
 * A part write must land on ONE shop's row.
 *
 * Reported from Location 2: "i put in pictures for these filter but it erased
 * on its own." Four filters that had photos were showing the empty placeholder.
 *
 * The rows were not corrupted and the images were not broken — the photos
 * array really had been emptied. `updatePart` scopes to `.in('shop_id',
 * getShopIds())` when no shopId is given, and getShopIds() is the MIRROR list:
 * every shop the operator can see. D1 Imports runs two locations that stock the
 * same filters under the same part numbers, so one row per location.
 *
 * The photo handler builds the new array from the row it has in hand and then
 * writes it unscoped:
 *
 *   newPhotos = [...selected.photos, ...justUploaded]   // Location 1's list
 *   updatePart(partNumber, { photos: newPhotos })       // writes BOTH rows
 *
 * So adding a photo at one location REPLACES the other location's photos with
 * this location's list. Add the first photo to a part at Location 1 and
 * Location 2's photos are gone — from Location 2 nobody touched anything, which
 * is exactly what "erased on its own" describes.
 *
 * The edit form already passes `selected.shopId` (PartsView:411). The photo
 * paths omitted it.
 *
 * STOCK IS DIFFERENT and stays mirror-wide — see the second block below. The
 * two rules live in one file on purpose: side by side it is obvious which
 * writes are per-location and which are shared, and neither can be "made
 * consistent" with the other by mistake.
 *
 * These assert the scope actually sent to PostgREST, because the caller cannot
 * see the difference — both forms return success.
 */
const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';

const mockFrom = jest.fn();
const mockUpdate = jest.fn();
const mockEqPart = jest.fn();
const mockEqShop = jest.fn();
const mockIn = jest.fn();
const mockSelect = jest.fn();
const mockRemove = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: () => ({ remove: (...a: unknown[]) => mockRemove(...a) }) },
  },
}));
// Both locations are visible — the mirror list is what makes an unscoped
// write reach the wrong row.
jest.mock('@/lib/shopStore', () => ({
  getShopId: () => SHOP_A,
  getShopIds: () => [SHOP_A, SHOP_B],
}));
jest.mock('@/lib/domain/auditFromBrowser', () => ({ recordAudit: jest.fn() }));

import { updatePart, deletePartPhoto, reservePart, updatePartQty } from '../partsService';

beforeEach(() => {
  for (const m of [mockFrom, mockUpdate, mockEqPart, mockEqShop, mockIn, mockSelect, mockRemove]) {
    m.mockReset();
  }
  mockRemove.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockUpdate.mockReturnValue({ eq: mockEqPart });
  // .eq('part_number', …) → the shop filter goes on next, either form.
  mockEqPart.mockReturnValue({ eq: mockEqShop, in: mockIn });
  mockEqShop.mockReturnValue({ select: mockSelect });
  mockIn.mockReturnValue({ select: mockSelect });
  mockSelect.mockResolvedValue({ data: [{ part_number: 'FLT-1' }], error: null });
});

/** How the shop was filtered: one row, or every mirrored shop. */
function shopScope(): { kind: 'one'; shopId: string } | { kind: 'mirror' } | { kind: 'none' } {
  if (mockEqShop.mock.calls.length > 0) {
    return { kind: 'one', shopId: mockEqShop.mock.calls[0][1] as string };
  }
  if (mockIn.mock.calls.length > 0) return { kind: 'mirror' };
  return { kind: 'none' };
}

describe('a photo write lands on one location, never across mirrored shops', () => {
  it('scopes a photo update to the row it came from', async () => {
    await updatePart('FLT-1', { photos: ['a.jpg'] }, SHOP_B);
    expect(shopScope()).toEqual({ kind: 'one', shopId: SHOP_B });
    expect(mockIn).not.toHaveBeenCalled();
  });

  it('deletePartPhoto scopes to the part it was opened from', async () => {
    // Removing a photo at one location must not rewrite the other location's
    // array — which is the same erasure in the other direction.
    await deletePartPhoto('FLT-1', 'b.jpg', ['a.jpg', 'b.jpg'], SHOP_B);
    expect(shopScope()).toEqual({ kind: 'one', shopId: SHOP_B });
  });

  it('still removes the file from storage', async () => {
    await deletePartPhoto('FLT-1', 'https://x/storage/v1/object/public/shop-assets/parts/s/FLT-1/1.jpg',
      ['https://x/storage/v1/object/public/shop-assets/parts/s/FLT-1/1.jpg'], SHOP_B);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

/**
 * Stock is the OPPOSITE of photos, and deliberately so.
 *
 * D1 Imports keeps ONE count per part number across both locations — the
 * operator confirmed this on 2026-09-05: "no stock is for both location keep
 * them sync." So a reservation must reach every mirrored row; scoping it to
 * one shop would let the two locations drift apart, and Location 1 would go on
 * advertising stock that Location 2 had already taken.
 *
 * These tests exist because the mirror-wide write LOOKS like the photo bug.
 * Anyone reading `updatePart(partNumber, { quantity })` with no shopId beside
 * the scoped photo calls would reasonably "fix" it. It is not a bug, it is the
 * inventory model, and this is where that is written down.
 */
describe('stock is one pool shared by both locations', () => {
  it('reservePart writes across every mirrored shop', async () => {
    await reservePart('FLT-1', 3);
    expect(shopScope()).toEqual({ kind: 'mirror' });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
  });

  it('updatePartQty writes across every mirrored shop', async () => {
    await updatePartQty('FLT-1', 7);
    expect(shopScope()).toEqual({ kind: 'mirror' });
  });

  it('offers no shopId parameter that would silently split the pool', () => {
    // A third argument would read as the safer choice next to the photo calls
    // and quietly break the shared count. Both take exactly their own args.
    expect(reservePart.length).toBe(2);
    expect(updatePartQty.length).toBe(2);
  });
});

describe('the mirror-wide fallback still exists for callers that cannot know the shop', () => {
  it('omitting shopId scopes to the mirror list, as documented', async () => {
    // Deliberate: stock depends on it, and so do callers that legitimately
    // hold only a part number. The bug was never the fallback — it was the
    // PHOTO writes taking it while knowing the shop all along.
    await updatePart('FLT-1', { retail: 10 });
    expect(shopScope()).toEqual({ kind: 'mirror' });
  });
});
