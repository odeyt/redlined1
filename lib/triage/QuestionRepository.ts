/**
 * Automotive Triage Engine — Question Repository
 * All question definitions. Never hardcoded into UI.
 */

import { Question } from './QuestionTypes';

const YN = (id: string, text: string, hint?: string): Question => ({
  id, text, type: 'yes_no', required: false, hint,
});

const SHORT = (id: string, text: string, placeholder?: string, required = false): Question => ({
  id, text, type: 'short_text', required, placeholder,
});

const LONG = (id: string, text: string, placeholder?: string): Question => ({
  id, text, type: 'long_text', required: false, placeholder,
});

const CHOICE = (id: string, text: string, options: string[], hint?: string): Question => ({
  id, text, type: 'multiple_choice', required: false, hint,
  options: options.map(o => ({ value: o.toLowerCase().replace(/\s+/g, '_'), label: o })),
});

const NUM = (id: string, text: string, unit?: string, min = 0, max = 999999): Question => ({
  id, text, type: 'number', required: false, unit, min, max,
});

// ─── Engine ───────────────────────────────────────────────────────────────────

export const ENGINE_QUESTIONS: Question[] = [
  CHOICE('eng_warning_lights', 'Any warning lights on?', ['Check Engine', 'Oil Pressure', 'Temperature', 'None', 'Other']),
  CHOICE('eng_symptom', 'Main symptom?', ['Misfiring', 'Rough idle', 'No power', 'Stalling', 'Hard start', 'Smoke', 'Knocking', 'Other']),
  YN('eng_dtc_scanned', 'Has the vehicle been scanned for DTCs?'),
  SHORT('eng_dtc_codes', 'DTC codes if known', 'e.g. P0300, P0171'),
  CHOICE('eng_smoke_color', 'Any smoke from exhaust?', ['None', 'White', 'Blue', 'Black', 'Grey']),
  YN('eng_oil_level_ok', 'Is oil level normal?'),
  CHOICE('eng_when', 'When does the symptom occur?', ['At idle', 'Under load', 'Cold start only', 'Always', 'Intermittent']),
  NUM('eng_mileage_since', 'Approx. miles since issue started', 'miles'),
  LONG('eng_customer_description', 'Describe the problem in the customer\'s own words', 'Customer states…'),
];

// ─── Transmission ─────────────────────────────────────────────────────────────

export const TRANSMISSION_QUESTIONS: Question[] = [
  CHOICE('trans_symptom', 'Main symptom?', ['Slipping', 'Hard shifts', 'No reverse', 'Delayed engagement', 'Shudder', 'Noise', 'Fluid leak', 'Other']),
  CHOICE('trans_type', 'Transmission type?', ['Automatic', 'Manual', 'CVT', 'DCT / Dual clutch', 'Unknown']),
  YN('trans_fluid_ok', 'Has fluid level been checked?'),
  CHOICE('trans_fluid_condition', 'Fluid condition?', ['Clean', 'Dark / burnt smell', 'Pink / milky', 'Unknown']),
  CHOICE('trans_warning_lights', 'Any warning lights?', ['Transmission', 'Check Engine', 'None', 'Other']),
  YN('trans_recent_service', 'Any recent transmission service?'),
  CHOICE('trans_when', 'When does it happen?', ['Cold only', 'Hot only', 'Always', 'Intermittent', 'Under load']),
  LONG('trans_notes', 'Additional details', 'Customer states…'),
];

// ─── Electrical ───────────────────────────────────────────────────────────────

export const ELECTRICAL_QUESTIONS: Question[] = [
  CHOICE('elec_symptom', 'Main symptom?', ['No start', 'Intermittent cut-out', 'Accessories not working', 'Fuse keeps blowing', 'Short circuit', 'Module communication fault', 'Other']),
  YN('elec_warning_lights', 'Any warning lights on the dash?'),
  SHORT('elec_warning_detail', 'Which warning lights?', 'e.g. ABS, Airbag, Battery'),
  YN('elec_battery_tested', 'Has the battery been tested?'),
  YN('elec_alternator_tested', 'Has the alternator been tested?'),
  CHOICE('elec_when', 'Does it occur?', ['Always', 'When wet / rainy', 'After heat soak', 'Cold start', 'Intermittent']),
  YN('elec_recent_work', 'Any recent electrical work or accessory install?'),
  LONG('elec_notes', 'Describe the electrical issue', 'Customer states…'),
];

// ─── Starting ─────────────────────────────────────────────────────────────────

export const STARTING_QUESTIONS: Question[] = [
  CHOICE('start_symptom', 'What happens when starting?', ['Cranks but won\'t start', 'Single click', 'Rapid clicking', 'No sound at all', 'Starts then dies', 'Hard to start when cold', 'Hard to start when hot']),
  YN('start_booster', 'Does it start with a booster / jump pack?'),
  CHOICE('start_battery_age', 'Battery age?', ['Less than 1 year', '1–3 years', 'Over 3 years', 'Unknown']),
  YN('start_immobilizer_light', 'Is the immobilizer / security light flashing?'),
  YN('start_fuel_smell', 'Any fuel smell?'),
  YN('start_recent_repair', 'Any recent repairs?'),
  CHOICE('start_when', 'When does no-start occur?', ['Always', 'Cold only', 'Hot only', 'After sitting', 'Intermittent']),
  LONG('start_notes', 'Additional notes', 'Customer states…'),
];

// ─── Battery ──────────────────────────────────────────────────────────────────

export const BATTERY_QUESTIONS: Question[] = [
  CHOICE('bat_symptom', 'Main complaint?', ['Dead battery', 'Slow crank', 'Battery warning light', 'Battery keeps dying', 'Swollen / leaking']),
  CHOICE('bat_age', 'Battery age?', ['Less than 1 year', '1–3 years', 'Over 3 years', 'Unknown']),
  YN('bat_tested', 'Has it been load tested?'),
  YN('bat_parasitic_drain', 'Suspecting parasitic drain?'),
  YN('bat_multiple_events', 'Has it happened more than once?'),
  CHOICE('bat_charging_system', 'Charging system checked?', ['Yes — OK', 'Yes — fault found', 'Not checked']),
  LONG('bat_notes', 'Additional details', 'Customer states…'),
];

// ─── Charging ─────────────────────────────────────────────────────────────────

export const CHARGING_QUESTIONS: Question[] = [
  YN('chg_warning_light', 'Battery / charging warning light on?'),
  CHOICE('chg_symptom', 'Main symptom?', ['Battery drains while driving', 'Warning light only', 'Accessories dim', 'Belt noise', 'Alternator replaced recently']),
  YN('chg_voltage_checked', 'Has charging voltage been measured?'),
  SHORT('chg_voltage_reading', 'Voltage at idle if measured', 'e.g. 13.8 V'),
  CHOICE('chg_belt_condition', 'Serpentine belt condition?', ['Good', 'Worn / cracked', 'Squealing', 'Unknown']),
  LONG('chg_notes', 'Additional details', 'Customer states…'),
];

// ─── Cooling ──────────────────────────────────────────────────────────────────

export const COOLING_QUESTIONS: Question[] = [
  CHOICE('cool_symptom', 'Main symptom?', ['Overheating', 'Temperature gauge high', 'Coolant loss', 'Coolant leak', 'Heater not working', 'Boiling / steam']),
  YN('cool_warning_light', 'Temperature warning light on?'),
  YN('cool_coolant_level_ok', 'Is coolant level OK?'),
  CHOICE('cool_leak_location', 'Leak location if visible?', ['Radiator', 'Hose', 'Water pump', 'Head gasket suspected', 'Overflow tank', 'Unknown / none visible']),
  YN('cool_fan_operating', 'Is the cooling fan operating?'),
  YN('cool_thermostat_replaced', 'Has thermostat been replaced recently?'),
  CHOICE('cool_when', 'Overheating occurs?', ['At idle', 'Highway speed', 'Always', 'With AC on']),
  LONG('cool_notes', 'Additional details', 'Customer states…'),
];

// ─── Air Conditioning ─────────────────────────────────────────────────────────

export const AC_QUESTIONS: Question[] = [
  YN('ac_cold_idle', 'Is the AC cold at idle?'),
  YN('ac_cold_driving', 'Is the AC cold while driving?'),
  YN('ac_compressor_engaging', 'Does the compressor engage (clutch cycling)?'),
  YN('ac_fan_operating', 'Is the cooling / condenser fan operating?'),
  CHOICE('ac_symptom', 'Main complaint?', ['Not cold at all', 'Intermittently cold', 'Warm at highway speed', 'Unusual smell', 'Water leaking inside', 'Noisy compressor']),
  YN('ac_warning_lights', 'Any warning lights related to AC?'),
  YN('ac_recent_repairs', 'Any recent AC repairs or recharge?'),
  CHOICE('ac_refrigerant', 'Refrigerant system status?', ['Never checked', 'Recharged recently', 'Known leak', 'Low pressure suspected']),
  LONG('ac_notes', 'Additional details', 'Customer states…'),
];

// ─── Heating ──────────────────────────────────────────────────────────────────

export const HEATING_QUESTIONS: Question[] = [
  CHOICE('heat_symptom', 'Main complaint?', ['No heat at all', 'Intermittent heat', 'Only warm — not hot', 'Blower not working', 'Bad smell when heat on']),
  YN('heat_coolant_level', 'Is coolant level OK?'),
  YN('heat_blend_door', 'Blend door actuator noise or failure suspected?'),
  CHOICE('heat_blower', 'Blower fan?', ['All speeds work', 'Some speeds missing', 'Not working at all']),
  CHOICE('heat_when', 'When does problem occur?', ['Always', 'Cold start only', 'After warm-up', 'Intermittent']),
  LONG('heat_notes', 'Additional details', 'Customer states…'),
];

// ─── Brakes ───────────────────────────────────────────────────────────────────

export const BRAKE_QUESTIONS: Question[] = [
  YN('brk_noise', 'Any noise when braking?'),
  CHOICE('brk_noise_type', 'Type of noise?', ['Squealing', 'Grinding', 'Clunking', 'Rattling', 'None'],
    'Answer if noise present'),
  YN('brk_vibration', 'Vibration felt through pedal or steering wheel?'),
  YN('brk_soft_pedal', 'Is the brake pedal soft or low?'),
  CHOICE('brk_pulling', 'Vehicle pulling?', ['No pulling', 'Pulls left', 'Pulls right']),
  YN('brk_abs_light', 'ABS warning light on?'),
  YN('brk_brake_light', 'Brake system warning light on?'),
  CHOICE('brk_last_service', 'Last brake service?', ['Within 1 year', '1–2 years ago', 'Over 2 years ago', 'Unknown']),
  LONG('brk_notes', 'Additional details', 'Customer states…'),
];

// ─── Steering ─────────────────────────────────────────────────────────────────

export const STEERING_QUESTIONS: Question[] = [
  CHOICE('str_symptom', 'Main complaint?', ['Heavy steering', 'Wandering / loose', 'Vibration in wheel', 'Pulling', 'Noise when turning', 'Play in wheel']),
  CHOICE('str_type', 'Steering type?', ['Power (hydraulic)', 'Electric power (EPAS)', 'Manual', 'Unknown']),
  YN('str_warning_light', 'Steering warning light on?'),
  YN('str_fluid_ok', 'Hydraulic fluid level OK (if applicable)?'),
  CHOICE('str_when', 'When does it occur?', ['At all speeds', 'Low speed only', 'High speed only', 'Turning only', 'Straight line']),
  LONG('str_notes', 'Additional details', 'Customer states…'),
];

// ─── Suspension ───────────────────────────────────────────────────────────────

export const SUSPENSION_QUESTIONS: Question[] = [
  CHOICE('sus_symptom', 'Main complaint?', ['Bouncing / poor ride', 'Knocking noise', 'Clunking over bumps', 'Vehicle sits low', 'Uneven tyre wear', 'Pulling']),
  CHOICE('sus_location', 'Which area?', ['Front left', 'Front right', 'Rear left', 'Rear right', 'General front', 'General rear', 'All corners']),
  YN('sus_noise', 'Noise over bumps or during steering input?'),
  CHOICE('sus_tyre_wear', 'Tyre wear pattern?', ['Even', 'Inner edge worn', 'Outer edge worn', 'Cupping / scalloping', 'Unknown']),
  LONG('sus_notes', 'Additional details', 'Customer states…'),
];

// ─── Noise ────────────────────────────────────────────────────────────────────

export const NOISE_QUESTIONS: Question[] = [
  CHOICE('noise_type', 'Type of noise?', ['Knocking', 'Ticking', 'Grinding', 'Whining', 'Humming', 'Rattling', 'Squealing', 'Clunking']),
  CHOICE('noise_origin', 'Where does it come from?', ['Engine bay', 'Under the car', 'Wheel / brakes', 'Interior / dash', 'Rear of vehicle', 'Intermittent / unknown']),
  CHOICE('noise_when', 'When does it occur?', ['Always', 'Accelerating', 'Decelerating', 'Turning', 'Braking', 'Cold start only', 'Over bumps', 'At speed']),
  YN('noise_changes_speed', 'Does noise change with vehicle speed?'),
  YN('noise_changes_temp', 'Does noise change with engine temperature?'),
  LONG('noise_notes', 'Describe the noise in detail', 'Customer states it sounds like…'),
];

// ─── Vibration ────────────────────────────────────────────────────────────────

export const VIBRATION_QUESTIONS: Question[] = [
  CHOICE('vib_location', 'Where is the vibration felt?', ['Steering wheel', 'Seat / floor', 'Whole vehicle', 'Pedals', 'Gear lever']),
  CHOICE('vib_when', 'When does it occur?', ['At idle', 'Specific speed range', 'Under acceleration', 'Braking', 'Always']),
  CHOICE('vib_speed', 'At what speed (approx)?', ['Under 30 mph', '30–60 mph', '60–80 mph', 'Over 80 mph', 'At idle only']),
  YN('vib_tyres_balanced', 'Have tyres been balanced recently?'),
  YN('vib_engine_mounts', 'Engine / trans mounts inspected?'),
  LONG('vib_notes', 'Additional details', 'Customer states…'),
];

// ─── Oil Leak ─────────────────────────────────────────────────────────────────

export const OIL_LEAK_QUESTIONS: Question[] = [
  CHOICE('oil_severity', 'Severity?', ['Drips when parked', 'Constant seep', 'Major leak', 'Just a smell — no visible drip']),
  CHOICE('oil_location', 'Leak location?', ['Front of engine', 'Rear of engine', 'Under transmission', 'Oil filter area', 'Valve cover', 'Pan gasket', 'Unknown']),
  CHOICE('oil_type', 'Type of fluid?', ['Engine oil', 'Transmission fluid', 'Power steering fluid', 'Coolant', 'Brake fluid', 'Unknown']),
  YN('oil_level_ok', 'Is oil level currently OK?'),
  LONG('oil_notes', 'Additional details', 'Customer states…'),
];

// ─── Fuel ─────────────────────────────────────────────────────────────────────

export const FUEL_QUESTIONS: Question[] = [
  CHOICE('fuel_symptom', 'Main complaint?', ['Hard to start', 'Poor fuel economy', 'Fuel smell', 'Hesitation / stumble', 'Fuel leak', 'Gauge inaccurate']),
  CHOICE('fuel_smell_location', 'Fuel smell location?', ['Exhaust', 'Engine bay', 'Fuel tank area', 'Inside vehicle', 'No smell']),
  YN('fuel_recent_fill', 'Recent fuel fill (new fuel station / fuel grade)?'),
  CHOICE('fuel_grade', 'Fuel grade used?', ['Regular', 'Premium required', 'E85', 'Diesel', 'Unknown']),
  YN('fuel_warning_light', 'Any fuel system warning lights?'),
  LONG('fuel_notes', 'Additional details', 'Customer states…'),
];

// ─── Programming ──────────────────────────────────────────────────────────────

export const PROGRAMMING_QUESTIONS: Question[] = [
  CHOICE('prog_type', 'What needs programming?', ['ECU / PCM', 'Transmission module', 'Key / fob', 'TPMS', 'ABS module', 'Body control module', 'Other']),
  YN('prog_module_replaced', 'Was a module recently replaced?'),
  YN('prog_battery_disconnect', 'Was the battery recently disconnected?'),
  SHORT('prog_dtc_codes', 'Any related DTC codes?', 'e.g. U0100'),
  CHOICE('prog_tool_required', 'Dealer tool required?', ['Yes', 'No', 'Unknown']),
  LONG('prog_notes', 'Additional details', 'Customer states…'),
];

// ─── Immobilizer ──────────────────────────────────────────────────────────────

export const IMMOBILIZER_QUESTIONS: Question[] = [
  YN('immo_light_on', 'Immobilizer / security light flashing?'),
  CHOICE('immo_symptom', 'What happens?', ['No start — no crank', 'Cranks but won\'t fire', 'Starts then cuts out immediately', 'Key not recognised']),
  YN('immo_key_programme', 'New key being programmed?'),
  YN('immo_recent_work', 'Any recent work near ignition / BCM?'),
  SHORT('immo_dtc', 'DTC codes if scanned', 'e.g. B1600'),
  LONG('immo_notes', 'Additional details', 'Customer states…'),
];

// ─── ADAS ─────────────────────────────────────────────────────────────────────

export const ADAS_QUESTIONS: Question[] = [
  CHOICE('adas_system', 'Which ADAS system?', ['Forward collision warning', 'Lane keep assist', 'Adaptive cruise', 'Blind spot monitor', 'Rear cross-traffic', 'Parking sensors', 'Camera system', 'Other']),
  YN('adas_warning_light', 'ADAS warning light on dash?'),
  YN('adas_recent_windscreen', 'Recent windscreen replacement?'),
  YN('adas_calibration_needed', 'Calibration requested?'),
  CHOICE('adas_trigger', 'What triggered the issue?', ['After collision', 'After glass replacement', 'Spontaneous', 'After other repair', 'Unknown']),
  LONG('adas_notes', 'Additional details', 'Customer states…'),
];

// ─── Hybrid ───────────────────────────────────────────────────────────────────

export const HYBRID_QUESTIONS: Question[] = [
  CHOICE('hyb_symptom', 'Main complaint?', ['Ready mode not activating', 'HV battery warning', 'Poor fuel economy', 'Not charging HV battery', 'Hybrid system fault light', 'Engine not auto-stopping']),
  YN('hyb_warning_light', 'Hybrid system warning light on?'),
  CHOICE('hyb_battery_health', 'HV battery health known?', ['Good — recently checked', 'Degraded', 'Not checked']),
  YN('hyb_12v_ok', 'Auxiliary 12V battery checked?'),
  LONG('hyb_notes', 'Additional details', 'Customer states…'),
];

// ─── EV ───────────────────────────────────────────────────────────────────────

export const EV_QUESTIONS: Question[] = [
  CHOICE('ev_symptom', 'Main complaint?', ['Won\'t charge', 'Reduced range', 'BMS fault light', 'No power', 'Charging port issue', 'Regen braking fault', 'Thermal management issue']),
  CHOICE('ev_charge_level', 'Current battery charge?', ['0–10%', '10–30%', '30–80%', '80–100%', 'Unknown']),
  CHOICE('ev_charge_type', 'Charging type used?', ['Level 1 (120V)', 'Level 2 (240V)', 'DC Fast Charge', 'Unknown']),
  YN('ev_warning_light', 'Any warning lights?'),
  SHORT('ev_dtc', 'DTC codes if scanned', 'e.g. P0A80'),
  LONG('ev_notes', 'Additional details', 'Customer states…'),
];

// ─── Other ────────────────────────────────────────────────────────────────────

export const OTHER_QUESTIONS: Question[] = [
  CHOICE('other_category', 'Closest category?', ['Interior', 'Exterior / body', 'Tyres / wheels', 'Exhaust', 'Odour', 'Performance', 'Lights', 'Windows / wipers', 'Unknown']),
  LONG('other_description', 'Describe the issue', 'Customer states…'),
  YN('other_warning_light', 'Any warning lights?'),
  SHORT('other_warning_detail', 'Which warning lights?', 'e.g. TPMS, Service'),
];

// ─── Registry ─────────────────────────────────────────────────────────────────

export const QUESTION_REGISTRY: Record<string, Question[]> = {
  engine:       ENGINE_QUESTIONS,
  transmission: TRANSMISSION_QUESTIONS,
  electrical:   ELECTRICAL_QUESTIONS,
  starting:     STARTING_QUESTIONS,
  battery:      BATTERY_QUESTIONS,
  charging:     CHARGING_QUESTIONS,
  cooling:      COOLING_QUESTIONS,
  ac:           AC_QUESTIONS,
  heating:      HEATING_QUESTIONS,
  brake:        BRAKE_QUESTIONS,
  steering:     STEERING_QUESTIONS,
  suspension:   SUSPENSION_QUESTIONS,
  noise:        NOISE_QUESTIONS,
  vibration:    VIBRATION_QUESTIONS,
  oil_leak:     OIL_LEAK_QUESTIONS,
  fuel:         FUEL_QUESTIONS,
  programming:  PROGRAMMING_QUESTIONS,
  immobilizer:  IMMOBILIZER_QUESTIONS,
  adas:         ADAS_QUESTIONS,
  hybrid:       HYBRID_QUESTIONS,
  ev:           EV_QUESTIONS,
  other:        OTHER_QUESTIONS,
};
