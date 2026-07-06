import type { CategoryId } from './QuestionTypes';

export type UrgencyLevel = 'routine' | 'priority' | 'urgent' | 'tow_in';

export interface SmartIntakeOutput {
  categoryId: CategoryId | null;
  complaintSummary: string;
  editedComplaintSummary: string;
  inspectionSuggestions: string[];
  urgency: UrgencyLevel;
  towIn: boolean;
  vehicleUnsafe: boolean;
  waitingCustomer: boolean;
  dataQualityScore: number;
}

/** Maps Smart Intake urgency → Job Card priority dropdown value */
export function urgencyToPriority(urgency: UrgencyLevel): string {
  switch (urgency) {
    case 'tow_in':   return 'Roadside';
    case 'urgent':   return 'High';
    case 'priority': return 'High';
    default:         return 'Normal';
  }
}

/** Maps Smart Intake complaint category → closest Job Card service type */
export function categoryToServiceHint(categoryId: CategoryId | null): string | null {
  if (!categoryId) return null;
  const MAP: Partial<Record<CategoryId, string>> = {
    brake:        'Brakes',
    engine:       'Engine',
    transmission: 'Transmission',
    electrical:   'Electrical',
    ac:           'AC/Heat',
    heating:      'AC/Heat',
    starting:     'Diagnostics',
    battery:      'Diagnostics',
    charging:     'Diagnostics',
    adas:         'Diagnostics',
    programming:  'Diagnostics',
    immobilizer:  'Diagnostics',
    ev:           'Diagnostics',
    hybrid:       'Diagnostics',
    noise:        'Diagnostics',
    vibration:    'Diagnostics',
  };
  return MAP[categoryId] ?? null;
}

/** Quick data quality score for the embedded panel (no full TriageVehicle needed) */
export function calculateQuickQuality(
  categoryId: CategoryId | null,
  answers: Record<string, unknown>,
  urgency: UrgencyLevel,
  vehicleKnown: boolean,
): number {
  let score = 0;
  if (vehicleKnown) score += 25;
  if (categoryId) score += 15;
  const answered = Object.values(answers).filter(v => v !== '' && v !== null && v !== undefined).length;
  score += Math.min(35, answered * 12);
  if (urgency !== 'routine') score += 10;
  score += 15; // base: being inside Smart Intake means staff took time to fill it out
  return Math.min(100, score);
}
