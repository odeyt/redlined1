/**
 * Automotive Triage Engine — Complaint Summary Builder
 * Generates a plain-English complaint summary from triage answers.
 * No LLM required — purely template-driven.
 */

import { CategoryId, AnswerMap } from './QuestionTypes';

type SummaryFn = (answers: AnswerMap) => string;

function yn(answers: AnswerMap, key: string): 'yes' | 'no' | null {
  const v = answers[key];
  if (v === true || v === 'yes') return 'yes';
  if (v === false || v === 'no') return 'no';
  return null;
}

function val(answers: AnswerMap, key: string): string {
  const v = answers[key];
  if (v === null || v === undefined) return '';
  return String(v).replace(/_/g, ' ');
}

// ─── Builders per category ────────────────────────────────────────────────────

const builders: Partial<Record<CategoryId, SummaryFn>> = {

  engine: (a) => {
    const parts: string[] = [];
    const symptom = val(a, 'eng_symptom');
    const when    = val(a, 'eng_when');
    const lights  = val(a, 'eng_warning_lights');
    const smoke   = val(a, 'eng_smoke_color');
    const dtcs    = val(a, 'eng_dtc_codes');
    const custom  = val(a, 'eng_customer_description');

    if (symptom) parts.push(`Customer reports engine ${symptom.toLowerCase()}`);
    if (when)    parts.push(`occurring ${when.toLowerCase()}`);
    if (lights && lights !== 'none') parts.push(`${lights} warning light(s) present`);
    if (smoke && smoke !== 'none')   parts.push(`${smoke} exhaust smoke observed`);
    if (dtcs)    parts.push(`DTCs noted: ${dtcs}`);
    if (custom)  parts.push(custom);
    return parts.length ? parts.join('. ') + '.' : 'Engine complaint — see technician notes.';
  },

  transmission: (a) => {
    const symptom = val(a, 'trans_symptom');
    const type    = val(a, 'trans_type');
    const when    = val(a, 'trans_when');
    const fluid   = val(a, 'trans_fluid_condition');
    const parts: string[] = [];
    if (symptom) parts.push(`Customer reports transmission ${symptom.toLowerCase()}`);
    if (type)    parts.push(`(${type})`);
    if (when)    parts.push(`occurring ${when.toLowerCase()}`);
    if (fluid && fluid !== 'unknown') parts.push(`fluid appears ${fluid.toLowerCase()}`);
    return parts.length ? parts.join(' ') + '.' : 'Transmission complaint — see technician notes.';
  },

  ac: (a) => {
    const parts: string[] = [];
    const coldIdle    = yn(a, 'ac_cold_idle');
    const coldDriving = yn(a, 'ac_cold_driving');
    const compressor  = yn(a, 'ac_compressor_engaging');
    const fan         = yn(a, 'ac_fan_operating');
    const lights      = yn(a, 'ac_warning_lights');
    const symptom     = val(a, 'ac_symptom');

    if (symptom) parts.push(`Customer states AC is ${symptom.toLowerCase()}`);
    if (coldIdle !== null)    parts.push(`AC is ${coldIdle === 'yes' ? '' : 'not '}cold at idle`);
    if (coldDriving !== null) parts.push(`${coldDriving === 'yes' ? 'remains cold' : 'becomes warm'} while driving`);
    if (compressor !== null)  parts.push(`compressor appears to ${compressor === 'yes' ? 'engage normally' : 'not engage'}`);
    if (fan !== null)         parts.push(`cooling fan ${fan === 'yes' ? 'operating' : 'not confirmed operating'}`);
    if (lights === 'no')      parts.push('no warning lights reported');
    return parts.length ? parts.join('. ') + '.' : 'AC complaint — see technician notes.';
  },

  starting: (a) => {
    const symptom   = val(a, 'start_symptom');
    const booster   = yn(a, 'start_booster');
    const immo      = yn(a, 'start_immobilizer_light');
    const fuel      = yn(a, 'start_fuel_smell');
    const batAge    = val(a, 'start_battery_age');
    const parts: string[] = [];

    if (symptom) parts.push(`Customer states vehicle ${symptom.toLowerCase()}`);
    if (booster !== null) parts.push(`${booster === 'yes' ? 'does' : 'does not'} start with booster`);
    if (immo === 'yes')   parts.push('immobilizer light reported flashing');
    if (fuel === 'yes')   parts.push('fuel smell noted');
    if (batAge)           parts.push(`battery approximately ${batAge.toLowerCase()}`);
    return parts.length ? parts.join('. ') + '.' : 'No-start complaint — see technician notes.';
  },

  brake: (a) => {
    const noise     = yn(a, 'brk_noise');
    const noiseType = val(a, 'brk_noise_type');
    const vib       = yn(a, 'brk_vibration');
    const soft      = yn(a, 'brk_soft_pedal');
    const pulling   = val(a, 'brk_pulling');
    const abs       = yn(a, 'brk_abs_light');
    const parts: string[] = [];

    if (noise === 'yes' && noiseType) parts.push(`Customer reports ${noiseType.toLowerCase()} noise when braking`);
    else if (noise === 'yes') parts.push('Customer reports braking noise');
    if (vib === 'yes')  parts.push('vibration felt through pedal or wheel');
    if (soft === 'yes') parts.push('pedal described as soft or low');
    if (pulling && pulling !== 'no pulling') parts.push(`vehicle ${pulling.toLowerCase()}`);
    if (abs === 'yes')  parts.push('ABS warning light on');
    return parts.length ? parts.join('. ') + '.' : 'Brake complaint — see technician notes.';
  },

  electrical: (a) => {
    const symptom = val(a, 'elec_symptom');
    const lights  = val(a, 'elec_warning_detail');
    const when    = val(a, 'elec_when');
    const recent  = yn(a, 'elec_recent_work');
    const parts: string[] = [];
    if (symptom) parts.push(`Customer reports ${symptom.toLowerCase()}`);
    if (lights)  parts.push(`warning lights: ${lights}`);
    if (when)    parts.push(`occurring ${when.toLowerCase()}`);
    if (recent === 'yes') parts.push('recent electrical work noted');
    return parts.length ? parts.join('. ') + '.' : 'Electrical complaint — see technician notes.';
  },

  cooling: (a) => {
    const symptom = val(a, 'cool_symptom');
    const fan     = yn(a, 'cool_fan_operating');
    const coolant = yn(a, 'cool_coolant_level_ok');
    const when    = val(a, 'cool_when');
    const parts: string[] = [];
    if (symptom) parts.push(`Customer reports ${symptom.toLowerCase()}`);
    if (when)    parts.push(`occurring ${when.toLowerCase()}`);
    if (coolant !== null) parts.push(`coolant level ${coolant === 'yes' ? 'appears OK' : 'reported low'}`);
    if (fan !== null)     parts.push(`cooling fan ${fan === 'yes' ? 'confirmed operating' : 'operation not confirmed'}`);
    return parts.length ? parts.join('. ') + '.' : 'Cooling system complaint — see technician notes.';
  },

  battery: (a) => {
    const symptom = val(a, 'bat_symptom');
    const age     = val(a, 'bat_age');
    const drain   = yn(a, 'bat_parasitic_drain');
    const parts: string[] = [];
    if (symptom) parts.push(`Customer reports ${symptom.toLowerCase()}`);
    if (age)     parts.push(`battery approximately ${age.toLowerCase()}`);
    if (drain === 'yes') parts.push('parasitic drain suspected');
    return parts.length ? parts.join('. ') + '.' : 'Battery complaint — see technician notes.';
  },

  noise: (a) => {
    const type   = val(a, 'noise_type');
    const origin = val(a, 'noise_origin');
    const when   = val(a, 'noise_when');
    const parts: string[] = [];
    if (type)   parts.push(`Customer reports ${type.toLowerCase()} noise`);
    if (origin) parts.push(`from ${origin.toLowerCase()}`);
    if (when)   parts.push(`occurring ${when.toLowerCase()}`);
    return parts.length ? parts.join(' ') + '.' : 'Noise complaint — see technician notes.';
  },

  vibration: (a) => {
    const location = val(a, 'vib_location');
    const when     = val(a, 'vib_when');
    const speed    = val(a, 'vib_speed');
    const parts: string[] = [];
    if (location) parts.push(`Customer reports vibration in ${location.toLowerCase()}`);
    if (when)     parts.push(`occurring ${when.toLowerCase()}`);
    if (speed)    parts.push(`at ${speed.toLowerCase()}`);
    return parts.length ? parts.join(', ') + '.' : 'Vibration complaint — see technician notes.';
  },

  oil_leak: (a) => {
    const severity = val(a, 'oil_severity');
    const location = val(a, 'oil_location');
    const type     = val(a, 'oil_type');
    const parts: string[] = [];
    if (type)     parts.push(`Customer reports ${type.toLowerCase()} leak`);
    if (severity) parts.push(`— ${severity.toLowerCase()}`);
    if (location) parts.push(`originating from ${location.toLowerCase()}`);
    return parts.length ? parts.join(' ') + '.' : 'Fluid leak complaint — see technician notes.';
  },

  fuel: (a) => {
    const symptom = val(a, 'fuel_symptom');
    const grade   = val(a, 'fuel_grade');
    const parts: string[] = [];
    if (symptom) parts.push(`Customer reports ${symptom.toLowerCase()}`);
    if (grade && grade !== 'unknown') parts.push(`fuel grade in use: ${grade}`);
    return parts.length ? parts.join('. ') + '.' : 'Fuel system complaint — see technician notes.';
  },

  adas: (a) => {
    const system  = val(a, 'adas_system');
    const trigger = val(a, 'adas_trigger');
    const calib   = yn(a, 'adas_calibration_needed');
    const parts: string[] = [];
    if (system)  parts.push(`Customer reports issue with ${system.toLowerCase()}`);
    if (trigger) parts.push(`triggered ${trigger.toLowerCase()}`);
    if (calib === 'yes') parts.push('calibration requested');
    return parts.length ? parts.join('. ') + '.' : 'ADAS complaint — see technician notes.';
  },

  ev: (a) => {
    const symptom = val(a, 'ev_symptom');
    const charge  = val(a, 'ev_charge_level');
    const type    = val(a, 'ev_charge_type');
    const parts: string[] = [];
    if (symptom) parts.push(`Customer reports ${symptom.toLowerCase()}`);
    if (charge)  parts.push(`battery at approximately ${charge.replace(/_/g, '').replace('percent', '%')}`);
    if (type)    parts.push(`using ${type.toLowerCase()} charging`);
    return parts.length ? parts.join('. ') + '.' : 'EV complaint — see technician notes.';
  },
};

// ─── Fallback generic builder ─────────────────────────────────────────────────

function genericBuilder(categoryId: CategoryId, answers: AnswerMap): string {
  const notesKey = Object.keys(answers).find(k => k.endsWith('_notes'));
  const descKey  = Object.keys(answers).find(k => k.endsWith('_description'));
  const custom   = notesKey ? val(answers, notesKey) : descKey ? val(answers, descKey) : '';
  return custom
    ? `Customer states: ${custom}`
    : `${categoryId.replace(/_/g, ' ')} complaint — see technician notes.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildComplaintSummary(categoryId: CategoryId, answers: AnswerMap): string {
  const builder = builders[categoryId];
  const raw = builder ? builder(answers) : genericBuilder(categoryId, answers);
  // Capitalise first letter
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
