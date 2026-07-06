/**
 * Automotive Triage Engine — Question Types
 * Defines every data shape used across the question engine.
 */

// ─── Question type discriminator ─────────────────────────────────────────────

export type QuestionInputType =
  | 'short_text'
  | 'long_text'
  | 'yes_no'
  | 'multiple_choice'
  | 'slider'
  | 'number'
  | 'date'
  | 'photo_upload'
  | 'video_upload'
  | 'voice_recording'   // placeholder
  | 'obd_upload';       // placeholder

// ─── Single question definition ───────────────────────────────────────────────

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionInputType;
  required: boolean;
  placeholder?: string;
  options?: QuestionOption[];          // for multiple_choice
  min?: number;                        // for slider / number
  max?: number;
  step?: number;
  unit?: string;                       // e.g. "mph", "°F", "PSI"
  hint?: string;                       // helper text shown below field
  /** If present, only show this question when the condition passes */
  showIf?: QuestionCondition;
}

export interface QuestionCondition {
  questionId: string;
  operator: 'eq' | 'neq' | 'includes' | 'truthy';
  value?: string;
}

// ─── Complaint categories ─────────────────────────────────────────────────────

export const COMPLAINT_CATEGORIES = [
  { id: 'engine',       label: 'Engine',          icon: '🔩' },
  { id: 'transmission', label: 'Transmission',    icon: '⚙️'  },
  { id: 'electrical',   label: 'Electrical',      icon: '⚡'  },
  { id: 'starting',     label: 'Starting',        icon: '🔑'  },
  { id: 'battery',      label: 'Battery',         icon: '🔋'  },
  { id: 'charging',     label: 'Charging',        icon: '🔌'  },
  { id: 'cooling',      label: 'Cooling',         icon: '🌡️'  },
  { id: 'ac',           label: 'Air Conditioning', icon: '❄️'  },
  { id: 'heating',      label: 'Heating',         icon: '🔥'  },
  { id: 'brake',        label: 'Brakes',          icon: '🛑'  },
  { id: 'steering',     label: 'Steering',        icon: '🎡'  },
  { id: 'suspension',   label: 'Suspension',      icon: '🚗'  },
  { id: 'noise',        label: 'Noise',           icon: '🔊'  },
  { id: 'vibration',    label: 'Vibration',       icon: '〰️'  },
  { id: 'oil_leak',     label: 'Oil Leak',        icon: '🛢️'  },
  { id: 'fuel',         label: 'Fuel',            icon: '⛽'  },
  { id: 'programming',  label: 'Programming',     icon: '💻'  },
  { id: 'immobilizer',  label: 'Immobilizer',     icon: '🔐'  },
  { id: 'adas',         label: 'ADAS',            icon: '🛡️'  },
  { id: 'hybrid',       label: 'Hybrid',          icon: '♻️'  },
  { id: 'ev',           label: 'EV',              icon: '⚡'  },
  { id: 'other',        label: 'Other',           icon: '🔧'  },
] as const;

export type CategoryId = typeof COMPLAINT_CATEGORIES[number]['id'];

// ─── Triage session ───────────────────────────────────────────────────────────

export interface TriageVehicle {
  customerId?: string;
  customerName?: string;
  vehicleId?: string;
  make: string;
  model: string;
  year: string;
  engine: string;
  mileage: string;
  fuelType: string;
  transmission: string;
}

export type TriageUrgency = 'routine' | 'priority' | 'urgent' | 'tow_in';

export interface TechnicianNotes {
  additionalObservations: string;
  customerRequests: string;
  urgency: TriageUrgency;
  towIn: boolean;
  vehicleUnsafe: boolean;
  waitingCustomer: boolean;
}

export interface AnswerMap {
  [questionId: string]: string | string[] | number | boolean | null;
}

export interface TriageSession {
  id?: string;
  shopId: string;
  vehicle: TriageVehicle;
  categoryId: CategoryId | null;
  answers: AnswerMap;
  techNotes: TechnicianNotes;
  complaintSummary: string;
  inspectionSuggestions: string[];
  dataQualityScore: number;
  status: 'draft' | 'complete' | 'converted';
  jobCardId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Flow state ────────────────────────────────────────────────────────────────

export interface TriageFlowState {
  step: 'vehicle' | 'category' | 'questions' | 'tech_notes' | 'summary';
  session: TriageSession;
  activeQuestions: Question[];
  validationErrors: Record<string, string>;
}
