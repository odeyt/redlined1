import type { PortalVehicle } from '@/services/portalService';

/**
 * The heading the portal shows for a vehicle: the name staff gave it
 * (vehicles.label), else year/make/model, else a plain fallback — never blank.
 *
 * Staff screens name vehicles by `label`; year/make/model are optional and
 * often empty. On 2026-10-14 a test customer's vehicle showed only its plate
 * because the portal used year/make/model alone.
 */
export function vehicleName(v: Pick<PortalVehicle, 'label' | 'year' | 'make' | 'model'>): string {
  const label = v.label?.trim();
  if (label) return label;
  const ymm = [v.year, v.make, v.model].map(s => String(s ?? '').trim()).filter(Boolean).join(' ');
  return ymm || 'Vehicle';
}
