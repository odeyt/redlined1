/**
 * Reading a VIN off a barcode, from a live camera or a photo.
 *
 * Every VIN on a modern vehicle is printed as a Code 39 or Code 128 barcode on
 * the door jamb sticker, which is what this reads. It is not text OCR: pointing
 * it at the etched VIN on the dashboard will not work, and the UI says so
 * rather than leaving the advisor holding a phone at a windscreen.
 *
 * BarcodeDetector is native and unevenly supported — Chrome and Android have
 * it, iOS Safari does not. Callers must check isBarcodeScanSupported() and fall
 * back to typing, which is why every entry point keeps the keyboard available.
 */

export const VIN_BARCODE_FORMATS = ['code_39', 'code_128', 'qr_code', 'pdf417', 'data_matrix'];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detector = { detect: (source: any) => Promise<{ rawValue?: string }[]> };

function detectorCtor(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).BarcodeDetector ?? null;
}

export function isBarcodeScanSupported(): boolean {
  return detectorCtor() !== null;
}

export function createVinDetector(): Detector | null {
  const BD = detectorCtor();
  if (!BD) return null;
  return new BD({ formats: VIN_BARCODE_FORMATS });
}

/**
 * A VIN is 17 characters and never contains I, O or Q — the standard excludes
 * them precisely because they are confusable with 1 and 0. Rejecting them here
 * discards a misread before it reaches the decoder and comes back "not found".
 */
export function normaliseVin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
  return cleaned.length === 17 ? cleaned : null;
}

/** First valid VIN among detected barcodes, or null. */
export function vinFromBarcodes(barcodes: { rawValue?: string }[]): string | null {
  for (const b of barcodes) {
    const vin = normaliseVin(b.rawValue);
    if (vin) return vin;
  }
  return null;
}

/** Read a VIN barcode out of a still image (an upload, or a camera roll photo). */
export async function scanVinFromFile(file: File): Promise<string | null> {
  const detector = createVinDetector();
  if (!detector) return null;
  const bitmap = await createImageBitmap(file);
  try {
    return vinFromBarcodes(await detector.detect(bitmap));
  } finally {
    // Bitmaps hold decoded pixel data; a few phone photos left unclosed is
    // real memory on a mid-range Android.
    bitmap.close?.();
  }
}
