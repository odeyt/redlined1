import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export type EntityType = 'job_card' | 'repair_order' | 'appointment' | 'parts_order';

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
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${entityType}s/${entityId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('shop-assets')
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('shop-assets').getPublicUrl(path);
  const url = urlData.publicUrl;

  const { data, error } = await supabase
    .from('entity_images')
    .insert({ entity_type: entityType, entity_id: entityId, shop_id: getShopId(), url, label, sort_order: 0 })
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

export async function saveEntityImageOrder(entityType: EntityType, entityId: string, ids: string[]): Promise<void> {
  const updates = ids.map((id, i) => ({ id, entity_type: entityType, entity_id: entityId, sort_order: i }));
  const { error } = await supabase
    .from('entity_images')
    .upsert(updates, { onConflict: 'id' });
  if (error) throw error;
}
