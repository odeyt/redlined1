import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';

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
    notes: p.notes ?? '',
  });
}

export async function updatePart(partNumber: string, updates: Partial<Part>): Promise<void> {
  const { error } = await supabase
    .from('parts')
    .update(toRow(updates))
    .eq('part_number', partNumber)
    .in('shop_id', getShopIds());
  if (error) throw error;
}

export async function deletePart(partNumber: string): Promise<void> {
  const { error } = await supabase.from('parts').delete().eq('part_number', partNumber).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function reservePart(partNumber: string, currentQty: number): Promise<number> {
  const newQty = Math.max(0, currentQty - 1);
  await updatePart(partNumber, { quantity: newQty });
  return newQty;
}

export async function updatePartQty(partNumber: string, qty: number): Promise<void> {
  await updatePart(partNumber, { quantity: qty });
}

export async function uploadPartPhoto(partNumber: string, file: File): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `parts/${getShopId()}/${partNumber}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('shop-assets')
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('shop-assets').getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePartPhoto(partNumber: string, url: string, allPhotos: string[]): Promise<void> {
  const marker = '/shop-assets/';
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const storagePath = url.slice(idx + marker.length);
    await supabase.storage.from('shop-assets').remove([storagePath]);
  }
  const newPhotos = allPhotos.filter(u => u !== url);
  await updatePart(partNumber, { photos: newPhotos });
}
