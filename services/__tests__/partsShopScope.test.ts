/**
 * A part is ONE item across both locations. Photos and stock are both shared.
 *
 * Reported from Location 2: "i put in pictures for these filter but it erased
 * on its own." Four filters that had photos were showing the empty placeholder.
 *
 * The rows were not corrupted and the images were not broken — the photos
 * array really had been emptied. D1 Imports runs two locations stocking the
 * same filters under the same part numbers, so there is one row per location,
 * and `updatePart` writes across all of them unless given a shopId.
 *
 * Writing mirror-wide was never the problem. Writing a list DERIVED FROM ONE
 * ROW mirror-wide was:
 *
 *   newPhotos = [...selected.photos, ...justUploaded]   // Location 1's list
 *   updatePart(partNumber, { photos: newPhotos })       // onto BOTH rows
 *
 * `selected.photos` is one location's view and has never contained what the
 * other location added, so the write silently deleted it. From Location 2
 * nobody touched anything — "erased on its own", exactly.
 *
 * Sharing is therefore expressed as a MERGE read back from the database
 * (`addPartPhotos`), never as a replace. A write can only ever add. The one
 * operation that removes is an explicit delete, which removes everywhere
 * because the file itself is gone from storage.
 *
 * Scoping photos per location was tried first and rejected: the operator wants
 * one picture of one filter, not two counters photographing it separately.
 *
 * These assert what is actually sent to PostgREST, because the caller cannot
 * tell the difference — every one of these shapes returns success.
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

import { updatePart, deletePartPhoto, addPartPhotos, reservePart, updatePartQty } from '../partsService';

// The READ chain is spied separately from the WRITE chain. Both end in
// .in('shop_id', …), so sharing spies would make every merge-read look like a
// mirror-wide write and shopScope() would stop discriminating.
const mockReadSelect = jest.fn();
const mockReadEqPart = jest.fn();
const mockReadIn = jest.fn();

/** Seed what each location's row currently holds, in mirror order. */
function dbPhotos(rows: string[][]) {
  mockReadIn.mockResolvedValue({ data: rows.map(photos => ({ photos })), error: null });
}

beforeEach(() => {
  for (const m of [mockFrom, mockUpdate, mockEqPart, mockEqShop, mockIn, mockSelect, mockRemove,
                   mockReadSelect, mockReadEqPart, mockReadIn]) {
    m.mockReset();
  }
  mockRemove.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ update: mockUpdate, select: mockReadSelect });

  // read: .select('photos').eq('part_number', …).in('shop_id', […])
  mockReadSelect.mockReturnValue({ eq: mockReadEqPart });
  mockReadEqPart.mockReturnValue({ in: mockReadIn });
  dbPhotos([[], []]);

  // write: .update(row).eq('part_number', …) then the shop filter, either form
  mockUpdate.mockReturnValue({ eq: mockEqPart });
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

/** What the photos column was set to. */
function writtenPhotos(): string[] {
  const row = mockUpdate.mock.calls.at(-1)?.[0] as { photos?: string[] } | undefined;
  return row?.photos ?? [];
}

describe('photos are shared across locations, and a write can only ever add', () => {
  it('merges what BOTH locations already had before adding the new one', async () => {
    // Location 1 has a.jpg, Location 2 has b.jpg — a real state, because each
    // counter photographed the filter in front of it.
    dbPhotos([['a.jpg'], ['b.jpg']]);
    const merged = await addPartPhotos('FLT-1', ['c.jpg']);
    expect(merged).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(writtenPhotos()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('NEVER drops a photo the other location added — the reported bug', async () => {
    // The browser holds Location 1's row, which has never contained b.jpg.
    // Building the new list from it and writing mirror-wide is what erased
    // Location 2's photos. The merge is read from the database instead.
    dbPhotos([['a.jpg'], ['b.jpg']]);
    await addPartPhotos('FLT-1', ['c.jpg']);
    expect(writtenPhotos()).toContain('b.jpg');
  });

  it('writes the shared list to every mirrored location', async () => {
    dbPhotos([['a.jpg'], []]);
    await addPartPhotos('FLT-1', ['c.jpg']);
    expect(shopScope()).toEqual({ kind: 'mirror' });
  });

  it('does not duplicate a photo already present at either location', async () => {
    dbPhotos([['a.jpg'], ['a.jpg', 'b.jpg']]);
    const merged = await addPartPhotos('FLT-1', ['b.jpg']);
    expect(merged).toEqual(['a.jpg', 'b.jpg']);
  });

  it('a delete removes only the named photo, and removes it everywhere', async () => {
    // Deleting is the one operation that should remove something: the file is
    // gone from storage, so leaving the URL elsewhere renders a broken image.
    dbPhotos([['a.jpg', 'b.jpg'], ['b.jpg', 'c.jpg']]);
    const left = await deletePartPhoto('FLT-1', 'b.jpg');
    expect(left).toEqual(['a.jpg', 'c.jpg']);
    expect(shopScope()).toEqual({ kind: 'mirror' });
  });

  it('still removes the file from storage', async () => {
    const u = 'https://x/storage/v1/object/public/shop-assets/parts/s/FLT-1/1.jpg';
    dbPhotos([[u], []]);
    await deletePartPhoto('FLT-1', u);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

/**
 * Stock is shared too, and unlike photos it is a REPLACE — correctly.
 *
 * D1 Imports keeps ONE count per part number across both locations (operator,
 * 2026-09-05: "no stock is for both location keep them sync"). A reservation
 * must reach every mirrored row; scoping it to one shop would let the counts
 * drift, and Location 1 would go on advertising stock Location 2 had taken.
 *
 * A quantity is a single fact, so writing the new value over both rows is
 * right. A photo list is an accumulation, so writing one row's copy over both
 * destroys information. Same mirror-wide write, opposite requirement — which
 * is why both rules are asserted in one file.
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
