import { compressImage, isAcceptedImage } from './compress';

/**
 * The one gate every photo goes through before it reaches storage.
 *
 * Until this existed, each upload service took whatever File it was handed:
 * no type check, no size limit, no compression. A 12MB phone photo went up at
 * 12MB, and nothing stopped a PDF — or anything else — being stored as a
 * "vehicle photo".
 *
 * Putting it in the service layer rather than the camera component matters:
 * most uploads still come from a plain file input, and a rule enforced only in
 * the component the technician happens to use is not a rule.
 *
 * This is a client-side gate and cannot be the whole story — a determined
 * caller can reach the storage API directly. Bucket-level MIME and size limits
 * are the durable fix; see the note in docs on the shop-assets bucket.
 */

/** Hard ceiling after compression. A photo should never approach this. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isAcceptedImage(file)) {
    throw new Error(`"${file.name}" is not an image. Photos only — JPEG, PNG, WebP or HEIC.`);
  }

  // compressImage returns the original untouched when compressing would not
  // help, and when the browser cannot decode the format at all.
  const prepared = await compressImage(file);

  if (prepared.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That image is still ${(prepared.size / 1024 / 1024).toFixed(1)}MB after compression, which is too large to upload. ` +
      `Take the photo at a lower resolution.`,
    );
  }

  return prepared;
}
