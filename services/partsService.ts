import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/domain/auditFromBrowser';
import { AUDIT } from '@/lib/domain/audit';
import { prepareImageForUpload } from '@/lib/image/prepareUpload';
import { toStoragePath } from '@/lib/storage/storagePath';
import { getShopId, getShopIds } from '@/lib/shopStore';
import { DEFAULT_CURRENCY } from '@/lib/currencies';

export interface Part {
  partNumber: string;
  brand: string;
  description: string;
  category: string;
  cost: number;
  retail: number;
  quantity: number;
  supplier: string;
  supplierPhone: string;
  supplierEmail: string;
  location: string;
  lowStockThreshold: number;
  reorderQty: number;
  compatibility: string;
  barcode: string;
  photos: string[];
  notes: string;
  /** ISO 4217 code the cost/retail figures are expressed in. */
  currency: string;
  /**
   * Shop the row belongs to. Needed so an update can target this exact row
   * instead of relying on the client's current mirror list, which resolves
   * asynchronously and may not yet include the part's location.
   */
  shopId: string;
}

export const PART_CATEGORIES = [
  'Brakes', 'Engine', 'Filters', 'Electrical', 'Suspension',
  'Fluids', 'Exhaust', 'Transmission', 'Tires', 'Cooling',
  'Fuel System', 'Steering', 'AC & Heating', 'Body', 'Other',
];

function mapRow(r: Record<string, unknown>): Part {
  return {
    partNumber:    (r.part_number as string)   || '',
    brand:         (r.brand as string)          || '',
    description:   (r.description as string)   || '',
    category:      (r.category as string)       || '',
    cost:          Number(r.cost ?? 0),
    retail:        Number(r.retail ?? 0),
    quantity:      Number(r.quantity ?? 0),
    supplier:      (r.supplier as string)       || '',
    supplierPhone: (r.supplier_phone as string) || '',
    supplierEmail: (r.supplier_email as string) || '',
    location:      (r.location as string)       || '',
    lowStockThreshold: Number(r.low_stock_threshold ?? 5),
    reorderQty:    Number(r.reorder_qty ?? 0),
    compatibility: (r.compatibility as string)  || '',
    barcode:       (r.barcode as string)        || '',
    photos:        Array.isArray(r.photos) ? (r.photos as string[]) : [],
    notes:         (r.notes as string)          || '',
    // Rows created before the currency column existed read as USD, which is
    // what the module assumed when every amount was hardcoded to a "$" prefix.
    currency:      (r.currency as string)       || DEFAULT_CURRENCY,
    shopId:        (r.shop_id as string)        || '',
  };
}

function toRow(p: Partial<Part>) {
  const row: Record<string, unknown> = {};
  if (p.partNumber    !== undefined) row.part_number        = p.partNumber;
  if (p.brand         !== undefined) row.brand              = p.brand;
  if (p.description   !== undefined) row.description        = p.description;
  if (p.category      !== undefined) row.category           = p.category;
  if (p.cost          !== undefined) row.cost               = p.cost;
  if (p.retail        !== undefined) row.retail             = p.retail;
  if (p.quantity      !== undefined) row.quantity           = p.quantity;
  if (p.supplier      !== undefined) row.supplier           = p.supplier;
  if (p.supplierPhone !== undefined) row.supplier_phone     = p.supplierPhone;
  if (p.supplierEmail !== undefined) row.supplier_email     = p.supplierEmail;
  if (p.location      !== undefined) row.location           = p.location;
  if (p.lowStockThreshold !== undefined) row.low_stock_threshold = p.lowStockThreshold;
  if (p.reorderQty    !== undefined) row.reorder_qty        = p.reorderQty;
  if (p.compatibility !== undefined) row.compatibility      = p.compatibility;
  if (p.barcode       !== undefined) row.barcode            = p.barcode;
  if (p.photos        !== undefined) row.photos             = p.photos;
  if (p.notes         !== undefined) row.notes              = p.notes;
  if (p.currency      !== undefined) row.currency           = p.currency;
  return row;
}

export async function fetchParts(): Promise<Part[]> {
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .in('shop_id', getShopIds())
    .order('description');
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function fetchPartByBarcode(barcode: string): Promise<Part | null> {
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('barcode', barcode)
    .in('shop_id', getShopIds())
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function createPart(p: Omit<Part, 'photos'> & { photos?: string[] }): Promise<Part> {
  const row = { ...toRow({ ...p, photos: p.photos ?? [] }), shop_id: getShopId() };
  const { data, error } = await supabase.from('parts').insert(row).select().single();
  if (error) throw error;

  await recordAudit({
    action: AUDIT.partCreated,
    entityType: 'part',
    entityId: data.part_number as string,
    after: {
      partNumber: data.part_number, brand: data.brand, description: data.description,
      cost: data.cost, retail: data.retail, quantity: data.quantity,
      supplier: data.supplier, currency: data.currency,
    },
  });
  return mapRow(data);
}

export async function savePart(p: Partial<Part> & { partNumber: string }): Promise<Part> {
  return createPart({
    partNumber: p.partNumber, brand: p.brand ?? '', description: p.description ?? '',
    category: p.category ?? 'Other', cost: p.cost ?? 0, retail: p.retail ?? 0,
    quantity: p.quantity ?? 0, supplier: p.supplier ?? '', supplierPhone: p.supplierPhone ?? '',
    supplierEmail: p.supplierEmail ?? '', location: p.location ?? '',
    lowStockThreshold: p.lowStockThreshold ?? 5, reorderQty: p.reorderQty ?? 0,
    compatibility: p.compatibility ?? '', barcode: p.barcode ?? '',
    notes: p.notes ?? '', currency: p.currency ?? DEFAULT_CURRENCY,
    // createPart() sets shop_id from the active shop; this is only here to
    // satisfy the Part shape and is never written as a column.
    shopId: p.shopId ?? '',
  });
}

/**
 * @param shopId  The shop the row lives in. Pass it whenever it is known (the
 *   edit form always knows it). Scoping to the row's own shop makes the update
 *   independent of getShopIds(), whose mirror list loads asynchronously — a
 *   save issued before it resolved matched zero rows and silently did nothing,
 *   which is what made edits to a second location appear not to save at all.
 *   Falls back to the mirror-scoped list when not supplied. RLS enforces shop
 *   membership either way, so this narrows the target, it does not widen access.
 */
export async function updatePart(partNumber: string, updates: Partial<Part>, shopId?: string): Promise<void> {
  // .select() so we can tell an update that matched nothing from one that
  // succeeded. PostgREST reports no error when a row-level policy filters every
  // candidate row, so without this a blocked save looks identical to a
  // successful one — the UI says "Saved" and the change silently disappears on
  // the next reload.
  const q = supabase
    .from('parts')
    .update(toRow(updates))
    .eq('part_number', partNumber);

  const { data, error } = await (shopId ? q.eq('shop_id', shopId) : q.in('shop_id', getShopIds()))
    .select('part_number');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      `Save did not apply to "${partNumber}" — no matching row was updated. ` +
      `This usually means a database permission rule rejected the change.`,
    );
  }

  // Stock movement is separated from an edit of the part itself. Quantity
  // changes every time a part is reserved or sold, and if those were filed as
  // generic updates they would bury the rarer, more interesting event of
  // somebody changing a price or a supplier.
  const keys = Object.keys(updates);
  const stockOnly = keys.length > 0 && keys.every(k => k === 'quantity');

  await recordAudit({
    action: stockOnly ? AUDIT.partStockChanged : AUDIT.partUpdated,
    entityType: 'part',
    entityId: partNumber,
    after: updates as Record<string, unknown>,
  });
}

export async function deletePart(partNumber: string): Promise<void> {
  const { data: before } = await supabase
    .from('parts').select('*').eq('part_number', partNumber).in('shop_id', getShopIds()).maybeSingle();

  // Every photo on every matching row, before the rows are gone.
  //
  // Deliberately a separate query rather than reading `before`: parts are keyed
  // on (shop_id, part_number), so a two-location shop can hold this number
  // twice, each with its own photos. Deleting the rows and keeping the files
  // is what left "Shell DOT 3" in the bucket with nothing pointing at it.
  const { data: rows } = await supabase
    .from('parts').select('photos').eq('part_number', partNumber).in('shop_id', getShopIds());

  const paths = (rows ?? [])
    .flatMap(r => (Array.isArray(r.photos) ? r.photos : []) as string[])
    .map(toStoragePath)
    .filter((p): p is string => Boolean(p));

  const { error } = await supabase.from('parts').delete().eq('part_number', partNumber).in('shop_id', getShopIds());
  if (error) throw error;

  // After the delete, and never allowed to fail it. A part that will not
  // delete because its photo could not be removed is worse than a stray file:
  // the row is the thing the user asked to be rid of.
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('shop-assets').remove(paths);
    if (storageError) console.error('[parts] photos left behind for ' + partNumber, storageError.message);
  }

  await recordAudit({
    action: AUDIT.partDeleted,
    entityType: 'part',
    entityId: partNumber,
    before: before ? {
      partNumber: before.part_number, brand: before.brand, description: before.description,
      cost: before.cost, retail: before.retail, quantity: before.quantity,
      supplier: before.supplier, location: before.location, currency: before.currency,
    } : null,
  });
}

/**
 * @param shopId  The location holding the stock. Pass it whenever it is known.
 *   Without it the write falls back to the mirror list, and a part number
 *   stocked at both D1 Imports locations had BOTH rows set to the same
 *   absolute quantity — reserve one filter at Location 2 and Location 1's
 *   count silently changed to match.
 */
export async function reservePart(partNumber: string, currentQty: number, shopId?: string): Promise<number> {
  const newQty = Math.max(0, currentQty - 1);
  await updatePart(partNumber, { quantity: newQty }, shopId);
  return newQty;
}

export async function updatePartQty(partNumber: string, qty: number, shopId?: string): Promise<void> {
  await updatePart(partNumber, { quantity: qty }, shopId);
}

export async function uploadPartPhoto(partNumber: string, file: File): Promise<string> {
  // Same gate as every other photo path — see prepareImageForUpload.
  const prepared = await prepareImageForUpload(file);
  const ext  = prepared.name.split('.').pop() ?? 'jpg';
  const path = `parts/${getShopId()}/${partNumber}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('shop-assets')
    .upload(path, prepared, { upsert: false, contentType: prepared.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('shop-assets').getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePartPhoto(partNumber: string, url: string, allPhotos: string[], shopId?: string): Promise<void> {
  // toStoragePath, not a local slice.
  //
  // The slice this replaced handed storage a PERCENT-ENCODED path, so removing
  // a photo of "PTT Dynamic Turbo" asked for "PTT%20Dynamic%20Turbo/...".
  // storage.remove() does not error on a key that is not there, so the row was
  // updated, the caller saw success, and the file stayed forever. Part numbers
  // with no space encode to themselves, which is why this only leaked on names
  // like "Shell DOT 3" and looked like nothing was wrong.
  const storagePath = toStoragePath(url);
  if (storagePath) {
    const { error } = await supabase.storage.from('shop-assets').remove([storagePath]);
    // Reported, not thrown: the photo must still leave the part, or the user
    // is stuck looking at an image they asked to remove.
    if (error) console.error('[parts] could not remove ' + storagePath, error.message);
  }
  const newPhotos = allPhotos.filter(u => u !== url);
  await updatePart(partNumber, { photos: newPhotos }, shopId);
}
