// Uses the FREE NHTSA vPIC API — no API key required
// https://vpic.nhtsa.dot.gov/api/

export interface VinDecodeResult {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyStyle: string;
  driveType: string;
  engineCylinders: string;
  engineDisplacement: string;
  engineHP: string;
  fuelType: string;
  transmission: string;
  vehicleType: string;
  plantCity: string;
  plantCountry: string;
  manufacturer: string;
  errorCode: string;
  errorText: string;
  label: string; // "2022 Ford F-150 XLT"
}

const FIELD_MAP: Record<string, keyof VinDecodeResult> = {
  'Model Year':                   'year',
  'Make':                         'make',
  'Model':                        'model',
  'Trim':                         'trim',
  'Body Class':                   'bodyStyle',
  'Drive Type':                   'driveType',
  'Engine Number of Cylinders':   'engineCylinders',
  'Displacement (L)':             'engineDisplacement',
  'Engine Brake (hp) From':       'engineHP',
  'Fuel Type - Primary':          'fuelType',
  'Transmission Style':           'transmission',
  'Vehicle Type':                 'vehicleType',
  'Plant City':                   'plantCity',
  'Plant Country':                'plantCountry',
  'Manufacturer Name':            'manufacturer',
  'Error Code':                   'errorCode',
  'Additional Error Text':        'errorText',
};

export async function decodeVinAPI(vin: string): Promise<VinDecodeResult> {
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) throw new Error('VIN must be exactly 17 characters.');

  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${clean}?format=json`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`NHTSA API error: ${res.status}`);

  const json = await res.json();
  const results: { Variable: string; Value: string | null }[] = json.Results ?? [];

  const out: Partial<VinDecodeResult> = { vin: clean };
  for (const item of results) {
    const key = FIELD_MAP[item.Variable];
    if (key && item.Value && item.Value !== 'Not Applicable') {
      (out as Record<string, string>)[key] = item.Value;
    }
  }

  out.year              ??= '';
  out.make              ??= '';
  out.model             ??= '';
  out.trim              ??= '';
  out.bodyStyle         ??= '';
  out.driveType         ??= '';
  out.engineCylinders   ??= '';
  out.engineDisplacement ??= '';
  out.engineHP          ??= '';
  out.fuelType          ??= '';
  out.transmission      ??= '';
  out.vehicleType       ??= '';
  out.plantCity         ??= '';
  out.plantCountry      ??= '';
  out.manufacturer      ??= '';
  out.errorCode         ??= '0';
  out.errorText         ??= '';
  out.label = [out.year, out.make, out.model, out.trim].filter(Boolean).join(' ');

  return out as VinDecodeResult;
}

export function vinChecksum(vin: string): boolean {
  const trans: Record<string, number> = {
    A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,
    J:1,K:2,L:3,M:4,N:5,P:7,R:9,
    S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9,
  };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  const v = vin.toUpperCase();
  if (v.length !== 17) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v[i];
    const val = /\d/.test(c) ? parseInt(c) : (trans[c] ?? 0);
    sum += val * weights[i];
  }
  const check = sum % 11;
  const checkChar = check === 10 ? 'X' : String(check);
  return v[8] === checkChar;
}

// Legacy mock export for backward compatibility with store.tsx
export interface VinResult {
  vin: string; year: string; make: string; model: string; trim: string;
  engine: string; transmission: string; driveType: string; bodyStyle: string;
}
export function decodeVin(vin: string): VinResult {
  return {
    vin: vin.toUpperCase(), year: '', make: '', model: '', trim: '',
    engine: '', transmission: '', driveType: '', bodyStyle: '',
  };
}
