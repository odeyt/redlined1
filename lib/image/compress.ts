/**
 * Preparing a phone photo for upload.
 *
 * A modern phone camera produces 4–12MB per shot. A technician documenting a
 * brake job takes six. On the shop's connection that is minutes of waiting, and
 * an upload that fails at 90% has to start again — which is how photo evidence
 * stops being collected.
 *
 * Downscaling to a long edge of 1600px and re-encoding as JPEG typically brings
 * a 6MB capture under 400KB, which is still far more detail than a damage photo
 * or a VIN plate needs to be legible.
 *
 * Orientation is handled by decoding with `imageOrientation: 'from-image'`.
 * Phones record rotation in EXIF rather than rotating pixels, and a canvas
 * ignores EXIF — so without this, photos taken in portrait upload sideways.
 */

export interface CompressOptions {
  /** Longest edge of the output, in pixels. */
  maxDimension?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
  /** Refuse anything above this before decoding it. */
  maxInputBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1600,
  quality: 0.82,
  // Decoding is what costs memory, and a mid-range Android will crash on a
  // very large file. Refusing with a message beats a dead tab.
  maxInputBytes: 25 * 1024 * 1024,
};

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function isAcceptedImage(file: File): boolean {
  // Some Android pickers hand over an empty type for HEIC; fall back to the
  // extension rather than rejecting a photo the user can plainly see.
  if (file.type) return ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase());
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/**
 * Downscale and re-encode. Returns the original untouched if compressing it
 * would not help — a small PNG screenshot of a VIN, for instance, can come out
 * larger as JPEG.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality, maxInputBytes } = { ...DEFAULTS, ...opts };

  if (file.size > maxInputBytes) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB, which is too large to process. Take the photo at a lower resolution.`);
  }
  if (!isAcceptedImage(file)) {
    throw new Error('That file is not an image. Photos only — JPEG, PNG, WebP or HEIC.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // HEIC on a browser that cannot decode it, or a corrupt file. Uploading
    // the original is better than losing the photo.
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.(png|webp|heic|heif)$/i, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    // Bitmaps hold decoded pixel data — several unclosed is real memory on a
    // phone partway through an inspection.
    bitmap.close?.();
  }
}
