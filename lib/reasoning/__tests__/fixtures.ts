/**
 * Test fixtures for the Evidence & Reasoning Engine.
 * All data is synthetic — no real customers, VINs, or shop data.
 */

import { ReasoningInput, SimilarRepairSummary, LessonSummary } from '../types';

// ─── Similar Repairs ──────────────────────────────────────────────────────────

const bmwSimilarRepairs: SimilarRepairSummary[] = [
  {
    make: 'BMW',
    model: '328i',
    year: '2014',
    engine: 'N20',
    dtcCodes: ['P0171', 'P0174'],
    symptoms: ['rough idle', 'lean misfire'],
    finalFix: 'Replace intake manifold gaskets and clean VANOS solenoids',
    similarityScore: 92,
    confidence: 0.91,
    verificationStatus: 'gold_verified',
    outcome: 'resolved',
  },
  {
    make: 'BMW',
    model: '320i',
    year: '2015',
    engine: 'N20',
    dtcCodes: ['P0171'],
    symptoms: ['rough idle'],
    finalFix: 'Replace intake boots and clean MAF sensor',
    similarityScore: 74,
    confidence: 0.72,
    verificationStatus: 'tech_verified',
    outcome: 'resolved',
  },
];

const bmwLessons: LessonSummary[] = [
  {
    title: 'BMW N20 lean codes — check boots before injectors',
    whatWasWrong: 'Cracked intake boots caused unmetered air entering after MAF',
    whatFooledUs: 'Injector contribution tests looked off — assumed bad injectors',
    finalFix: 'Replace both intake boots; clean MAF sensor',
    checkFirstNextTime: 'Inspect intake boots and hose clamps under load',
    commonMistake: 'Ordering injectors without checking for air leaks first',
    verifiedStatus: 'published',
    confidence: 90,
  },
];

// ─── BMW 328i — High confidence case ─────────────────────────────────────────

export const bmwFixture: ReasoningInput = {
  repairCaseId: 'test-bmw-001',
  shopId: 'shop-test-001',
  make: 'BMW',
  model: '328i',
  year: '2014',
  engine: 'N20 2.0T',
  transmission: 'ZF 8HP',
  mileage: 145000,
  vin: null,
  complaint: 'Rough idle, lean codes P0171 P0174, hesitation on acceleration',
  cause: 'Cracked intake boot causing unmetered air, lean condition',
  dtcCodes: ['P0171', 'P0174'],
  symptoms: ['rough idle', 'lean misfire', 'hesitation on acceleration', 'MAF sensor reading low'],
  testsPerformed: ['smoke test', 'voltage test on MAF', 'oscilloscope waveform capture'],
  partsReplaced: ['intake boot left', 'intake boot right', 'MAF sensor'],
  finalFix: 'Replaced both intake boots and MAF sensor. Cleared lean adaptations.',
  lessonLearned: 'Always check intake boots before injectors on N20 lean codes',
  confidenceScore: 85,
  verificationStatus: 'gold_verified',
  outcomes: [{ outcome: 'resolved', comeback: false, warrantyClaim: false, verifiedFix: true }],
  similarRepairs: bmwSimilarRepairs,
  lessons: bmwLessons,
};

// ─── Toyota Camry — Medium confidence comeback case ───────────────────────────

export const toyotaFixture: ReasoningInput = {
  repairCaseId: 'test-toyota-002',
  shopId: 'shop-test-001',
  make: 'Toyota',
  model: 'Camry',
  year: '2018',
  engine: '2AR-FE 2.5L',
  transmission: 'Automatic',
  mileage: 98000,
  vin: null,
  complaint: 'Check engine light, P0420 catalyst efficiency below threshold',
  cause: null,
  dtcCodes: ['P0420'],
  symptoms: ['check engine light', 'slight fuel smell'],
  testsPerformed: ['voltage test on O2 sensors'],
  partsReplaced: ['catalytic converter'],
  finalFix: 'Replaced catalytic converter bank 1',
  lessonLearned: null,
  confidenceScore: 60,
  verificationStatus: 'thirty_day_verified',
  outcomes: [
    { outcome: 'comeback', comeback: true, warrantyClaim: false, verifiedFix: false },
    { outcome: 'resolved', comeback: false, warrantyClaim: false, verifiedFix: true },
  ],
  similarRepairs: [
    {
      make: 'Toyota',
      model: 'Camry',
      year: '2017',
      engine: '2AR-FE',
      dtcCodes: ['P0420'],
      symptoms: ['check engine light'],
      finalFix: 'Replaced catalytic converter and upstream O2 sensor',
      similarityScore: 88,
      confidence: 0.82,
      verificationStatus: 'tech_verified',
      outcome: 'resolved',
    },
  ],
  lessons: [],
};

// ─── Ford F-150 — Low confidence, no tests ───────────────────────────────────

export const fordFixture: ReasoningInput = {
  repairCaseId: 'test-ford-003',
  shopId: 'shop-test-001',
  make: 'Ford',
  model: 'F-150',
  year: '2019',
  engine: '5.0L Coyote',
  transmission: null,
  mileage: null,
  vin: null,
  complaint: 'No start, battery light, alternator suspected',
  cause: null,
  dtcCodes: [],
  symptoms: ['no start', 'battery light on', 'dim headlights'],
  testsPerformed: [],
  partsReplaced: [],
  finalFix: null,
  lessonLearned: null,
  confidenceScore: null,
  verificationStatus: 'pending',
  outcomes: [],
  similarRepairs: [],
  lessons: [],
};

// ─── Mercedes C300 — Electrical/CAN bus ──────────────────────────────────────

export const mercedesFixture: ReasoningInput = {
  repairCaseId: 'test-mercedes-004',
  shopId: 'shop-test-001',
  make: 'Mercedes-Benz',
  model: 'C300',
  year: '2020',
  engine: 'M264 2.0T',
  transmission: '9G-Tronic',
  mileage: 52000,
  vin: null,
  complaint: 'Multiple warning lights, U0100 lost communication with ECM',
  cause: 'Corroded ground strap under battery tray causing CAN bus drop-outs',
  dtcCodes: ['U0100', 'U0155', 'C0040'],
  symptoms: ['multiple warning lights', 'intermittent stalling', 'ABS active at low speed'],
  testsPerformed: ['oscilloscope waveform on CAN bus', 'voltage test on grounds', 'resistance test on ground straps'],
  partsReplaced: ['ground strap battery to chassis', 'ground strap engine to chassis'],
  finalFix: 'Replaced both corroded ground straps. Cleared all codes. Verified CAN bus communication.',
  lessonLearned: 'Check all ground straps before replacing modules on U01xx codes',
  confidenceScore: 92,
  verificationStatus: 'gold_verified',
  outcomes: [{ outcome: 'resolved', comeback: false, warrantyClaim: false, verifiedFix: true }],
  similarRepairs: [
    {
      make: 'Mercedes-Benz',
      model: 'C-Class',
      year: '2019',
      engine: 'M264',
      dtcCodes: ['U0100'],
      symptoms: ['multiple warning lights'],
      finalFix: 'Replace battery ground strap',
      similarityScore: 85,
      confidence: 0.88,
      verificationStatus: 'tech_verified',
      outcome: 'resolved',
    },
  ],
  lessons: [
    {
      title: 'U01xx codes — check grounds before replacing modules',
      whatWasWrong: 'Corroded ground straps causing intermittent CAN bus communication loss',
      whatFooledUs: 'Scanner showed ECM fault — assumed module failure',
      finalFix: 'Replace ground straps',
      checkFirstNextTime: 'Resistance test all ground straps when U01xx codes are present',
      commonMistake: 'Ordering replacement ECM/TCM without checking grounds first',
      verifiedStatus: 'published',
      confidence: 95,
    },
  ],
};
