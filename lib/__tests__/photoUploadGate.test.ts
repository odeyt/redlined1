/**
 * Phase 6 — every photo goes through one gate.
 *
 * Before this, each upload service took whatever File it was handed: no type
 * check, no size limit, no compression. A 12MB phone photo went up at 12MB,
 * and nothing stopped a PDF being stored as a "vehicle photo". Only the
 * inspection camera compressed, because that was the one path built with it.
 *
 * The gate lives in the services rather than the camera component on purpose:
 * most uploads still arrive from a plain file input, and a rule enforced only
 * in the component a technician happens to use is not a rule.
 *
 * This is a client-side gate and cannot be the whole story — a determined
 * caller can reach the storage API directly. Bucket-level MIME and size limits
 * are the durable fix, and the shop-assets bucket is still public, which is an
 * open decision rather than an oversight.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const gate = read('lib/image/prepareUpload.ts');
const SERVICES = ['vehicleImageService', 'entityImageService', 'partsService', 'inspectionService', 'shopSettingsService'];

describe('one gate, applied everywhere', () => {
  it.each(SERVICES)('%s prepares the file before uploading', name => {
    const src = read(`services/${name}.ts`);
    expect(src).toMatch(/import \{ prepareImageForUpload \} from '@\/lib\/image\/prepareUpload'/);
    expect(src).toMatch(/await prepareImageForUpload\(file\)/);
  });

  it.each(SERVICES)('%s uploads the prepared file, not the original', name => {
    const src = read(`services/${name}.ts`);
    // Passing `file` after preparing it would make the whole gate decorative.
    expect(src).toMatch(/\.upload\(path, prepared/);
    expect(src).not.toMatch(/\.upload\(path, file/);
  });

  it.each(SERVICES)('%s sets the content type from the prepared file', name => {
    const src = read(`services/${name}.ts`);
    // Compression rewrites HEIC and PNG to JPEG; the stored type must follow
    // or the browser is told the wrong thing about its own bytes.
    expect(src).toMatch(/contentType: prepared\.type/);
  });
});

describe('what the gate refuses', () => {
  it('rejects anything that is not an image', () => {
    expect(gate).toMatch(/if \(!isAcceptedImage\(file\)\)/);
    expect(gate).toMatch(/Photos only — JPEG, PNG, WebP or HEIC/);
  });

  it('caps the size after compression, not before', () => {
    // Before would reject a large photo that compresses down fine.
    expect(gate).toMatch(/const prepared = await compressImage\(file\)/);
    // Against the check, not the constant's declaration, which sits at the top.
    expect(gate.indexOf('compressImage(file)'))
      .toBeLessThan(gate.indexOf('prepared.size > MAX_UPLOAD_BYTES'));
  });

  it('names the size and says what to do about it', () => {
    expect(gate).toMatch(/after compression, which is too large to upload/);
    expect(gate).toMatch(/lower resolution/);
  });

  it('is honest that a client gate is not the whole story', () => {
    expect(gate).toMatch(/client-side gate and cannot be the whole story/);
  });
});

describe('a rejected photo is not silently dropped', () => {
  const vehicles = read('features/vehicles/VehiclesView.tsx');

  it('reports failures instead of skipping them', () => {
    // Was a bare `catch {}`. With validation in place a rejection became both
    // more likely and more meaningful.
    expect(vehicles).not.toMatch(/catch \{ \/\* skip failed file \*\/ \}/);
    expect(vehicles).toMatch(/failures\.push/);
    expect(vehicles).toMatch(/if \(failures\.length\) notify/);
  });

  it('names the file that failed and why', () => {
    expect(vehicles).toMatch(/\$\{file\.name\}: \$\{e instanceof Error \? e\.message : 'upload failed'\}/);
  });
});

describe('the camera reaches the surfaces that need it', () => {
  it('vehicle photos can be taken, not only chosen', () => {
    const vehicles = read('features/vehicles/VehiclesView.tsx');
    expect(vehicles).toMatch(/<CameraCapture/);
    expect(vehicles).toMatch(/📷 Take photo/);
  });

  it('the file picker stays for desktop', () => {
    // CameraCapture falls back to the picker itself, so neither route is lost.
    const vehicles = read('features/vehicles/VehiclesView.tsx');
    expect(vehicles).toMatch(/choose from your files/i);
  });

  it('inspection photos already route through the camera', () => {
    expect(read('features/inspections/InspectionsView.tsx')).toMatch(/<CameraCapture/);
  });
});

describe('uploads are attached to something', () => {
  it.each([
    ['vehicleImageService', /vehicles\/\$\{vehicleId\}/],
    ['entityImageService', /\$\{entityType\}s\/\$\{entityId\}/],
    ['partsService', /parts\/\$\{getShopId\(\)\}/],
    ['inspectionService', /inspections\/\$\{inspectionId\}/],
  ])('%s scopes the storage path to its entity', (name, pattern) => {
    // No orphaned uploads: every object sits under the record it belongs to.
    expect(read(`services/${name}.ts`)).toMatch(pattern as RegExp);
  });
});
