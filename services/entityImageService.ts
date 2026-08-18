import { supabase } from '@/lib/supabase';
import { prepareImageForUpload } from '@/lib/image/prepareUpload';
import { getShopId } from '@/lib/shopStore';

export type EntityType = 'job_card' | 'repair_order' | 'appointment' | 'parts_order' | 'parts_estimate';

export interface EntityImage {
  id: string;
  url: string;
  label: string;
  sortOrder: number;
}

export async function fetchEntityImages(
  entityType: EntityType,
  entityId: string,
): Promise<EntityImage[]> {
  const { data, error } = await supabase
    .from('entity_images')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id,
    url: r.url,
    label: r.label ?? '',
    sortOrder: r.sort_order ?? 0,
  }));
}

export async function uploadEntityImage(
  entityType: EntityType,
  entityId: string,
  file: File,
  label = 'Photo',
): Promise<EntityImage> {
  // Same gate as every other photo path — see prepareImageForUpload.
  const prepared = await prepareImageForUpload(file);
  const ext = prepared.name.split('.').pop() || 'jpg';
  const path = `${entityType}s/${entityId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('shop-assets')
    .upload(path, prepared, { upsert: false, contentType: prepared.type });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('shop-assets').getPublicUrl(path);
  const url = urlData.publicUrl;

  const shopId = getShopId() || null;
  const { data, error } = await supabase
    .from('entity_images')
    .insert({ entity_type: entityType, entity_id: entityId, shop_id: shopId, url, label, sort_order: 0 })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, url: data.url, label: data.label ?? '', sortOrder: data.sort_order ?? 0 };
}

export async function deleteEntityImage(id: string, url: string): Promise<void> {
  const match = url.match(/shop-assets\/(.+)$/);
  if (match) await supabase.storage.from('shop-assets').remove([match[1]]);
  const { error } = await supabase.from('entity_images').delete().eq('id', id);
  if (error) throw error;
}

export async function updateEntityImageLabel(id: string, label: string): Promise<void> {
  const { error } = await supabase.from('entity_images').update({ label }).eq('id', id);
  if (error) throw error;
}

export async function saveEntityImageOrder(entityType: EntityType, entityId: string, ids: string[]): Promise<void> {
  const updates = ids.map((id, i) => ({ id, entity_type: entityType, entity_id: entityId, sort_order: i }));
  const { error } = await supabase
    .from('entity_images')
    .upsert(updates, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * Move a set of photos from one record to another.
 *
 * Converting a parts quotation to a parts order creates a new row with a new
 * id and deletes the quotation. Images are keyed on (entity_type, entity_id),
 * so without this they keep pointing at an id that no longer exists: the rows
 * survive, the storage objects survive, and nothing displays them anywhere.
 * To the person who attached them, the photos were erased.
 *
 * Returns how many were moved, so the caller can decide whether it is safe to
 * delete the record they came from.
 */
export async function reassignEntityImages(
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('entity_images')
    .update({ entity_type: toType, entity_id: toId })
    .eq('entity_type', fromType)
    .eq('entity_id', fromId)
    .select('id');
  if (error) throw error;

  // The storage paths still read parts_estimates/<old id>/… and are left
  // alone. A path is an opaque key here; renaming objects would mean a copy,
  // a delete and a rewritten url for every photo, and any failure midway
  // would lose the file rather than merely mislabel it.
  return (data ?? []).length;
}
