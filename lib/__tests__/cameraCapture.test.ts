/**
 * Camera capture for technicians (Phase 4), and photo compression.
 *
 * A phone camera produces 4–12MB a shot and a technician documenting a brake
 * job takes six. On shop wifi that is minutes of waiting, and an upload that
 * dies at 90% has to start over — which is how photo evidence stops being
 * collected. Downscaling to a 1600px long edge brings a 6MB capture under
 * 400KB while staying far more legible than a damage photo needs.
 *
 * The other half is failure. Permission refused, no camera, an insecure
 * origin, a browser without getUserMedia — each has to lead somewhere, because
 * a photo from the camera roll is worth exactly as much as one taken here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const camera  = read('components/camera/CameraCapture.tsx');
const compress = read('lib/image/compress.ts');
const view    = read('features/inspections/InspectionsView.tsx');

describe('the photo is prepared before it is uploaded', () => {
  it('downscales to a bounded long edge', () => {
    expect(compress).toMatch(/maxDimension: 1600/);
    expect(compress).toMatch(/const scale = longest > maxDimension \? maxDimension \/ longest : 1/);
  });

  it('respects EXIF orientation', () => {
    // Phones record rotation in EXIF rather than rotating pixels, and a canvas
    // ignores EXIF — without this, portrait photos upload sideways.
    expect(compress).toMatch(/imageOrientation: 'from-image'/);
  });

  it('refuses an image too large to decode safely', () => {
    // Decoding is what costs memory; a mid-range Android dies on a huge file.
    expect(compress).toMatch(/maxInputBytes: 25 \* 1024 \* 1024/);
    expect(compress).toMatch(/too large to process/);
  });

  it('keeps the original when compressing would not help', () => {
    expect(compress).toMatch(/if \(!blob \|\| blob\.size >= file\.size\) return file;/);
  });

  it('keeps the original when the browser cannot decode it', () => {
    // HEIC on a browser without support: uploading as-is beats losing it.
    expect(compress).toMatch(/return file;\s*\n\s*\}/);
    expect(compress).toMatch(/HEIC on a browser that cannot decode it/);
  });

  it('frees the decoded bitmap', () => {
    expect(compress).toMatch(/bitmap\.close\?\.\(\)/);
  });

  it('validates that the file is an image at all', () => {
    expect(compress).toMatch(/export function isAcceptedImage/);
    expect(compress).toMatch(/\.\(jpe\?g\|png\|webp\|heic\|heif\)\$/);
  });
});

describe('every failure has somewhere to go', () => {
  it('distinguishes refusal from absence from breakage', () => {
    expect(camera).toMatch(/name === 'NotAllowedError' \|\| name === 'SecurityError'/);
    expect(camera).toMatch(/name === 'NotFoundError' \|\| name === 'OverconstrainedError'/);
  });

  it('treats a missing getUserMedia as unsupported, not broken', () => {
    // Also the state on plain http, which looks like a broken camera.
    expect(camera).toMatch(/!navigator\.mediaDevices\?\.getUserMedia/);
    expect(camera).toMatch(/secure context/);
  });

  it('always offers the photo picker as a way through', () => {
    expect(camera).toMatch(/🖼 Choose a photo/);
    expect(camera).toMatch(/accept="image\/\*" capture="environment"/);
  });

  it('lets the operator retry the camera after refusing it', () => {
    expect(camera).toMatch(/Try the camera again/);
  });

  it('prefers the rear camera', () => {
    expect(camera).toMatch(/facingMode: \{ ideal: 'environment' \}/);
  });

  it('releases the camera when it closes', () => {
    expect(camera).toMatch(/useEffect\(\(\) => stop, \[stop\]\)/);
    expect(camera).toMatch(/getTracks\(\)\.forEach\(t => t\.stop\(\)\)/);
  });

  it('does not leak object URLs', () => {
    expect(camera).toMatch(/URL\.revokeObjectURL/);
  });
});

describe('nothing is uploaded before it has been seen', () => {
  it('captures to a preview rather than straight out', () => {
    // A blurred brake disc found later is a job re-inspected.
    expect(camera).toMatch(/setPhase\('preview'\)/);
  });

  it('offers retake and confirm', () => {
    expect(camera).toMatch(/Retake/);
    expect(camera).toMatch(/Use this photo/);
  });

  it('hands the caller a file and nothing else', () => {
    // Keeps it reusable across inspections, vehicles and parts without knowing
    // anything about storage.
    expect(camera).toMatch(/onCapture: \(file: File\) => void/);
    expect(camera).not.toMatch(/supabase/i);
  });

  it('the shutter is a thumb-sized target', () => {
    expect(camera).toMatch(/width: 76, height: 76/);
  });
});

describe('a failed upload keeps the photo', () => {
  it('holds the file for retry instead of discarding it', () => {
    expect(view).toMatch(/setFailedPhoto\(\{ file, itemId: targetItemId \}\)/);
    expect(view).toMatch(/the photo is still here/);
  });

  it('offers Retry and Discard', () => {
    expect(view).toMatch(/\{uploadingItemId \? 'Retrying…' : 'Retry'\}/);
    expect(view).toMatch(/Discard/);
  });

  it('reports the failure with safe identifiers only', () => {
    // Ids and a byte count — no image contents, no customer detail.
    expect(view).toMatch(/logger\.error\('inspections\.photoUpload failed'/);
    expect(view).toMatch(/\{ inspectionId: editingId, itemId: targetItemId, bytes: file\.size \}/);
  });

  it('clears the held photo once it succeeds', () => {
    expect(view).toMatch(/setFailedPhoto\(null\);\s*\n\s*notify\('Photo uploaded\.'\)/);
  });
});

describe('the photo lands on the item it was taken for', () => {
  it('the item id is passed explicitly, not read from state', () => {
    // setPhotoTargetItem is async; reading it here attaches the photo to the
    // previously selected item.
    expect(view).toMatch(/async function handlePhotoUpload\(file: File, itemId\?: string\)/);
    expect(view).toMatch(/const targetItemId = itemId \?\? photoTargetItem/);
  });

  it('both entry points open the camera', () => {
    expect(view).toMatch(/onPhoto=\{itemId => setCameraItemId\(itemId\)\}/);
    expect(view).toMatch(/onClick=\{\(\) => setCameraItemId\(item\.id\)\}/);
  });

  it('cancelling leaves no target armed', () => {
    expect(view).toMatch(/onCancel=\{\(\) => setCameraItemId\(null\)\}/);
  });
});
