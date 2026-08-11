import { supabase } from '@/lib/supabase';
import { prepareImageForUpload } from '@/lib/image/prepareUpload';

export interface VehicleImage {
  id: string;
  vehicleId: string;
  url: string;
  label: string;
}

export async function fetchVehicleImages(vehicleId: string): Promise<VehicleImage[]> {
  const { data, error } = await supabase
    .from('vehicle_images')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(r => ({ id: r.id, vehicleId: r.vehicle_id, url: r.url, label: r.label }));
}

export async function uploadVehicleImage(vehicleId: string, file: File, label = 'Vehicle photo'): Promise<VehicleImage> {
  // Validated and compressed here rather than at the call site: most vehicle
  // photos still arrive from a plain file input, and a rule enforced only in
  // the camera component is not a rule.
  const prepared = await prepareImageForUpload(file);
  const ext = prepared.name.split('.').pop() || 'jpg';
  const path = `vehicles/${vehicleId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('shop-assets')
    .upload(path, prepared, { upsert: false, contentType: prepared.type });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('shop-assets').getPublicUrl(path);
  const url = urlData.publicUrl;

  const { data, error } = await supabase
    .from('vehicle_images')
    .insert({ vehicle_id: vehicleId, url, label })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, vehicleId: data.vehicle_id, url: data.url, label: data.label };
}

export async function deleteVehicleImage(id: string, url: string): Promise<void> {
  // Extract storage path from URL
  const match = url.match(/shop-assets\/(.+)$/);
  if (match) {
    await supabase.storage.from('shop-assets').remove([match[1]]);
  }
  const { error } = await supabase.from('vehicle_images').delete().eq('id', id);
  if (error) throw error;
}
