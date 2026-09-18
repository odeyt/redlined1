import { supabase } from '@/lib/supabase';
import { prepareImageForUpload } from '@/lib/image/prepareUpload';
import {
  canonicalVehicleObjectPath,
  parseVehiclePhotoRef,
  projectHostFromUrl,
  validateVehicleObjectPath,
  SHOP_ASSETS_BUCKET,
} from '@/lib/storage/vehiclePhotoRef';

const BUCKET = SHOP_ASSETS_BUCKET;

/**
 * The host this build talks to. Legacy URLs are only converted into keys when
 * they name THIS project — a URL is attacker-influenced input the moment
 * anything other than this app can write the column, and a key derived from
 * someone else's host is a key we would then hand to remove().
 */
function projectHost(): string | undefined {
  const w = typeof window !== 'undefined' ? (window as unknown as { __SB_URL__?: string }) : undefined;
  return projectHostFromUrl(w?.__SB_URL__ || process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export interface VehicleImage {
  id: string;
  vehicleId: string;
  /** Legacy fully-qualified URL. Kept for rows written before storage_path. */
  url: string;
  /**
   * The canonical, non-expiring object key: `vehicles/<vehicle-id>/<file>`.
   * Empty only when a legacy row's url could not be positively identified.
   */
  storagePath: string;
  label: string;
}

/**
 * What to hand a <StorageImage>.
 *
 * The key when there is one, the legacy URL otherwise. Never a signed URL —
 * signing happens at the render boundary and its output is never stored or
 * passed back into a service.
 */
export function vehicleImageRef(img: { storagePath?: string | null; url?: string | null }): string {
  return img.storagePath || img.url || '';
}

interface Row { id: string; vehicle_id: string; url: string | null; storage_path?: string | null; label: string | null }

function toImage(r: Row): VehicleImage {
  const url = r.url ?? '';
  // storage_path is the truth when present. Deriving it from the url is the
  // transitional path and uses the STRICT parse, not the lenient render-time
  // one: a value we cannot positively identify becomes '' and falls back to
  // the url rather than becoming a key we might later sign or remove.
  const derived = r.storage_path ?? parseVehiclePhotoRef(url, { projectHost: projectHost() }).path ?? '';
  const storagePath = validateVehicleObjectPath(derived, r.vehicle_id).valid ? derived : '';
  return { id: r.id, vehicleId: r.vehicle_id, url, storagePath, label: r.label ?? '' };
}

export async function fetchVehicleImages(vehicleId: string): Promise<VehicleImage[]> {
  // select('*') rather than a column list so this build runs either side of
  // the storage_path migration: the column is simply absent until it lands.
  const { data, error } = await supabase
    .from('vehicle_images')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(r => toImage(r as Row));
}

/**
 * Is this the error you get for writing `storage_path` before the column
 * exists?
 *
 * The column arrives with 2026-09-18_vehicle_images_storage_path.sql, and a
 * deploy can reach production before a migration does — a browser tab picks up
 * the new bundle the moment it is live, whoever is running the SQL. Without
 * this, that window is not a degraded upload, it is a FAILED one: PostgREST
 * rejects the whole insert over the unknown column and the photo the
 * technician just took is lost.
 *
 * So the write is attempted in its canonical form and, only for this specific
 * error, retried without the new column. The row is then exactly what the
 * previous build would have written, and the backfill picks it up later.
 * Delete this once the migration is applied everywhere.
 */
function isMissingStoragePathColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: string; message?: string };
  // PGRST204: "Could not find the 'storage_path' column ... in the schema
  // cache". 42703 is Postgres's own undefined_column, for the direct path.
  if (code === 'PGRST204' || code === '42703') return true;
  return !!message && /storage_path/.test(message) && /column|schema cache/i.test(message);
}

/**
 * Upload, then persist. In that order, and never the reverse.
 *
 * If the object upload fails there is nothing to record. If the object
 * uploads but the row does not, the row is what the app reads, so the photo
 * would be invisible AND the bucket would hold a file nobody can reach —
 * so that one newly-created object, and only that one, is removed again.
 * The key removed is the key this function just built, validated against the
 * vehicle it was built for; nothing here removes by prefix, by pattern, or by
 * a value read back from anywhere else.
 */
export async function uploadVehicleImage(
  vehicleId: string,
  file: File,
  label = 'Vehicle photo',
): Promise<VehicleImage> {
  // Validated and compressed here rather than at the call site: most vehicle
  // photos still arrive from a plain file input, and a rule enforced only in
  // the camera component is not a rule.
  const prepared = await prepareImageForUpload(file);
  const ext = prepared.name.split('.').pop() || 'jpg';
  const path = canonicalVehicleObjectPath(vehicleId, `${Date.now()}.${ext}`);

  const check = validateVehicleObjectPath(path, vehicleId);
  if (!check.valid) throw new Error(`Refusing to upload to an unexpected path: ${check.reason}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared, { upsert: false, contentType: prepared.type });
  if (uploadError) throw uploadError;

  // `url` is still written for the whole transition: the previous build, and
  // any consumer that has not learned about storage_path, reads that column.
  // It is a public-form URL, which is a stable NAME for the object — not a
  // signed one, which would expire.
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const legacy = { vehicle_id: vehicleId, url: urlData.publicUrl, label };
  let { data, error } = await supabase
    .from('vehicle_images')
    .insert({ ...legacy, storage_path: path })
    .select()
    .single();

  if (error && isMissingStoragePathColumn(error)) {
    ({ data, error } = await supabase
      .from('vehicle_images')
      .insert(legacy)
      .select()
      .single());
  }

  if (error) {
    await removeExactObject(path, vehicleId, 'orphaned upload');
    throw error;
  }
  return toImage(data as Row);
}

/**
 * Replace the photo behind an existing row.
 *
 * Upload the new object, persist the new key, and only then remove the old
 * one. Any other order can lose the photo: deleting first and failing to
 * upload leaves the row pointing at nothing, and updating the row before the
 * object exists leaves a window where the app asks storage for a key that is
 * not there yet.
 *
 * If the row update fails, the OLD object is left exactly as it was and the
 * newly uploaded one is removed. The caller keeps the photo it had.
 */
export async function replaceVehicleImage(
  id: string,
  vehicleId: string,
  file: File,
  opts: { removeOldObject?: boolean } = {},
): Promise<VehicleImage> {
  const existing = await supabase
    .from('vehicle_images')
    .select('*')
    .eq('id', id)
    .eq('vehicle_id', vehicleId)
    .single();
  if (existing.error) throw existing.error;
  const before = toImage(existing.data as Row);

  const prepared = await prepareImageForUpload(file);
  const ext = prepared.name.split('.').pop() || 'jpg';
  const newPath = canonicalVehicleObjectPath(vehicleId, `${Date.now()}.${ext}`);
  const check = validateVehicleObjectPath(newPath, vehicleId);
  if (!check.valid) throw new Error(`Refusing to upload to an unexpected path: ${check.reason}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, prepared, { upsert: false, contentType: prepared.type });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(newPath);
  let { data, error } = await supabase
    .from('vehicle_images')
    .update({ url: urlData.publicUrl, storage_path: newPath })
    .eq('id', id)
    .eq('vehicle_id', vehicleId)
    .select()
    .single();

  if (error && isMissingStoragePathColumn(error)) {
    ({ data, error } = await supabase
      .from('vehicle_images')
      .update({ url: urlData.publicUrl })
      .eq('id', id)
      .eq('vehicle_id', vehicleId)
      .select()
      .single());
  }

  if (error) {
    await removeExactObject(newPath, vehicleId, 'orphaned replacement upload');
    throw error;
  }

  // Cleanup of the superseded object is opt-in and happens last. A failure
  // here leaves a file in the bucket, which costs storage; doing it earlier
  // risks losing the only copy of a photo.
  if (opts.removeOldObject && before.storagePath && before.storagePath !== newPath) {
    await removeExactObject(before.storagePath, vehicleId, 'superseded photo');
  }

  return toImage(data as Row);
}

/**
 * Remove one object by its exact key, after proving the key belongs to this
 * vehicle.
 *
 * Every deletion in this file goes through here. `remove()` takes an array
 * and will happily accept anything, including a value that came out of a
 * variable nobody checked — so the check is here rather than at each call
 * site. It never takes a prefix, a wildcard, or a name derived from customer
 * data.
 */
async function removeExactObject(path: string, vehicleId: string, why: string): Promise<void> {
  const check = validateVehicleObjectPath(path, vehicleId);
  if (!check.valid) {
    console.error(`[vehicle-images] refusing to remove (${why}): ${check.reason}`);
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error(`[vehicle-images] could not remove ${path} (${why})`, error.message);
}

/**
 * Delete a photo: the row first, then the object.
 *
 * The row is what the application reads. Removing the object first and then
 * failing to remove the row leaves a photo that looks present and never
 * loads — indistinguishable, to the person looking at it, from the expiry bug
 * this work is fixing. Removing the row first and failing on the object
 * leaves an unreferenced file, which costs a few kilobytes and nothing else.
 */
export async function deleteVehicleImage(id: string, ref: string, vehicleId?: string): Promise<void> {
  const row = await supabase
    .from('vehicle_images')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return;

  const image = toImage(row.data as Row);
  if (vehicleId && image.vehicleId !== vehicleId) {
    throw new Error('Refusing to delete a photo that belongs to another vehicle.');
  }

  const { error } = await supabase.from('vehicle_images').delete().eq('id', id);
  if (error) throw error;

  // `ref` is accepted for call-site compatibility but is NOT what gets
  // removed: the key comes from the row that was just read and deleted, so a
  // stale value held by a component cannot direct a deletion.
  void ref;
  if (image.storagePath) await removeExactObject(image.storagePath, image.vehicleId, 'deleted photo');
}
