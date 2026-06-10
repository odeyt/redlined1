import type { Part } from '@/lib/types';

const defaults = { supplierPhone: '', supplierEmail: '', reorderQty: 0, barcode: '', photos: [], notes: '' };

export const partsInventory: Part[] = [
  {
    partNumber: 'BRK-PAD-7812', brand: 'Akebono',
    description: 'Premium ceramic front brake pads', category: 'Brakes',
    cost: 68.2, retail: 129.5, quantity: 4, supplier: 'Metro Parts Warehouse',
    location: 'B-14', lowStockThreshold: 5, compatibility: 'F-150, Expedition selected trims',
    ...defaults,
  },
  {
    partNumber: 'ROT-55109', brand: 'Raybestos',
    description: 'Front brake rotor', category: 'Brakes',
    cost: 64.4, retail: 118, quantity: 10, supplier: 'Metro Parts Warehouse',
    location: 'B-16', lowStockThreshold: 4, compatibility: 'F-150 2021-2024',
    ...defaults,
  },
  {
    partNumber: 'FLT-CAB-901', brand: 'Denso',
    description: 'Cabin air filter', category: 'Filters',
    cost: 15.2, retail: 39.95, quantity: 22, supplier: 'Northstar Auto Supply',
    location: 'M-03', lowStockThreshold: 8, compatibility: 'Toyota RAV4 2019-2025',
    ...defaults,
  },
  {
    partNumber: 'O2-BMW-4421', brand: 'Bosch',
    description: 'Wideband oxygen sensor', category: 'Engine',
    cost: 82, retail: 166, quantity: 2, supplier: 'EuroTech Distribution',
    location: 'E-09', lowStockThreshold: 3, compatibility: 'BMW B48 engine applications',
    ...defaults,
  },
];

export const initialPartsInventory = partsInventory;
