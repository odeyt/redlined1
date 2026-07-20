/**
 * lib/freeLimits.ts
 * Free Forever plan usage limits.
 * Server-side enforcement only — never trust client-side values.
 */

export interface FreeLimitConfig {
  customers: number;
  vehicles: number;
  completedJobsPerMonth: number;
  aiCasesPerMonth: number;
  vinLookupsPerMonth: number;
  appointmentsPerMonth: number;
  dviPerMonth: number;
  storageMb: number;
  users: number;
  locations: number;
  technicians: number;
}

export const FREE_LIMITS: FreeLimitConfig = {
  customers:            10,
  vehicles:             10,
  completedJobsPerMonth: 5,
  aiCasesPerMonth:       2,
  vinLookupsPerMonth:    2,
  appointmentsPerMonth:  5,
  dviPerMonth:           2,
  storageMb:           250,
  users:                 1,
  locations:             1,
  technicians:           1,
};

export type FreeLimitKey = keyof FreeLimitConfig;

/** Keys that reset monthly (vs. absolute capacity caps). */
export const MONTHLY_KEYS: FreeLimitKey[] = [
  'completedJobsPerMonth',
  'aiCasesPerMonth',
  'vinLookupsPerMonth',
  'appointmentsPerMonth',
  'dviPerMonth',
];

/** Human-readable labels for upgrade modal display. */
export const FREE_LIMIT_LABELS: Record<FreeLimitKey, string> = {
  customers:            'Customers',
  vehicles:             'Vehicles',
  completedJobsPerMonth:'Completed Jobs / mo',
  aiCasesPerMonth:      'AI Cases / mo',
  vinLookupsPerMonth:   'VIN Lookups / mo',
  appointmentsPerMonth: 'Appointments / mo',
  dviPerMonth:          'Digital Inspections / mo',
  storageMb:            'Storage',
  users:                'Team Members',
  locations:            'Locations',
  technicians:          'Technicians',
};
