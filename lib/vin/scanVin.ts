/**
 * Reading a VIN off a barcode, from a live camera or a photo.
 *
 * Every VIN on a modern vehicle is printed as a Code 39 or Code 128 barcode on
 * the door jamb sticker, which is what this reads. It is not text OCR:
 * pointing it at the etched VIN on the dashboard will not work, and the UI
 * says so rather than leaving the advisor holding a phone at a windscreen.
 *
 * Two decoders, in order:
 *
 *   BarcodeDetector  native, fast, no download — Chrome on Android, ChromeOS
 *                    and macOS only
 *   ZXing            everywhere else, loaded on demand
 *
 * The native path stays first because it costs nothing when present. ZXing is
 * dynamically imported so the ~200KB only reaches browsers that tap Scan and
 * cannot do it natively — a shop on Chrome for Android never downloads it.
 *
 * Windows, Linux and iOS have no BarcodeDetector at all, which is most of the
 * desk-bound use of this app, so the fallback is the common path rather than
 * an edge case.
 */

export const VIN_BARCODE_FORMATS = ['code_39', 'code_128', 'qr_code', 'pdf417', 'data_matrix'];

/* eslint-disable @typescript-eslint/no-explicit-any */
type NativeDetector = { detect: (source: any) => Promise<{ rawValue?: string }[]> };

function nativeCtor(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).BarcodeDetector ?? null;
}

/** True when the browser can decode without downloading anything. */
export function hasNativeBarcodeDetector(): boolean {
  return nativeCtor() !== null;
}

/**
 * Scanning is now supported everywhere, because ZXing covers what the native
 * API does not. Kept as a function rather than a constant: callers should not
 * have to know which decoder answered.
 */
export function isBarcodeScanSupported(): boolean {
  return true;
}

/** Whether a live camera can be opened at all — absent on desktops with no webcam. */
export function isCameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function createVinDetector(): NativeDetector | null {
  const BD = nativeCtor();
  return BD ? new BD({ formats: VIN_BARCODE_FORMATS }) : null;
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

/** ZXing, configured for the formats a VIN sticker actually uses. */
async function zxingReader() {
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  // Narrowing the formats matters: left open, ZXing tries every symbology on
  // every frame, which is visibly slow on a mid-range phone.
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_128,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.PDF_417,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

/** Read a VIN barcode out of a still image (an upload, or a camera roll photo). */
export async function scanVinFromFile(file: File): Promise<string | null> {
  const native = createVinDetector();
  if (native) {
    const bitmap = await createImageBitmap(file);
    try {
      const vin = vinFromBarcodes(await native.detect(bitmap));
      if (vin) return vin;
      // Fall through to ZXing rather than giving up: the two decoders fail on
      // different images, and a second attempt costs one download.
    } finally {
      bitmap.close?.();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const reader = await zxingReader();
    const result = await reader.decodeFromImageUrl(url);
    return normaliseVin(result?.getText());
  } catch {
    return null; // ZXing throws NotFoundException when there is no barcode
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode continuously from a video element that already has a stream.
 *
 * Returns a stop function. The caller owns the MediaStream — this only reads
 * frames — so stopping the scan never silently kills someone else's camera.
 */
export async function startVinVideoScan(
  video: HTMLVideoElement,
  onVin: (vin: string) => void,
): Promise<() => void> {
  const native = createVinDetector();

  if (native) {
    let raf = 0;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const vin = vinFromBarcodes(await native.detect(video));
        if (vin) { cancelled = true; onVin(vin); return; }
      } catch { /* a frame that will not decode is normal — keep looking */ }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }

  const reader = await zxingReader();
  let stopped = false;
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (stopped || !result) return;
    const vin = normaliseVin(result.getText());
    if (vin) { stopped = true; controls.stop(); onVin(vin); }
  });
  return () => { stopped = true; controls.stop(); };
}
