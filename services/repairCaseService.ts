import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { logger } from '@/lib/logger';
import { mapRepairCaseById } from '@/services/knowledgeGraphService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VerificationStatus = 'pending' | 'tech_verified' | 'thirty_day_verified' | 'gold_verified';

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  pending:              'Pending',
  tech_verified:        'Tech Verified',
  thirty_day_verified:  '30-Day Verified',
  gold_verified:        'Gold Verified ⭐',
};

export const VERIFICATION_NEXT: Record<VerificationStatus, VerificationStatus | null> = {
  pending:              'tech_verified',
  tech_verified:        'thirty_day_verified',
  thirty_day_verified:  'gold_verified',
  gold_verified:        null,
};

export const VERIFICATION_COLORS: Record<VerificationStatus, string> = {
  pending:              '#9e9e9e',
  tech_verified:        '#2196f3',
  thirty_day_verified:  '#ff9800',
  gold_verified:        '#4caf50',
};

export interface RepairCase {
  id: string;
  shopId: string;
  jobCardId?: string;
  repairOrderId?: string;
  roNumber?: string;
  vehicleId?: string;
  customerId?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  transmission?: string;
  mileage?: number;
  complaint?: string;
  technicianNotes?: string;
  finalFix?: string;
  lessonLearned?: string;
  laborHours?: number;
  confidenceScore?: number;
  verificationStatus: VerificationStatus;
  isAnonymized: boolean;
  shareToNetwork: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepairCaseWithDetails extends RepairCase {
  dtcs: RepairCaseDtc[];
  symptoms: RepairCaseSymptom[];
  tests: RepairCaseTest[];
  parts: RepairCasePart[];
  outcomes: RepairCaseOutcome[];
}

export interface RepairCaseDtc {
  id: string;
  shopId: string;
  repairCaseId: string;
  code: string;
  description?: string;
  module?: string;
  status?: string;
}

export interface RepairCaseSymptom {
  id: string;
  shopId: string;
  repairCaseId: string;
  symptom: string;
  severity?: string;
}

export interface RepairCaseTest {
  id: string;
  shopId: string;
  repairCaseId: string;
  testName: string;
  result?: string;
  passed?: boolean;
  notes?: string;
}

export interface RepairCasePart {
  id: string;
  shopId: string;
  repairCaseId: string;
  partName: string;
  partNumber?: string;
  supplier?: string;
  cost?: number;
  replaced: boolean;
}

export interface RepairCaseOutcome {
  id: string;
  shopId: string;
  repairCaseId: string;
  outcome: string;
  comeback: boolean;
  comebackDays?: number;
  warrantyClaim: boolean;
  customerSatisfied?: boolean;
  verifiedFix: boolean;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapCase(r: Record<string, unknown>): RepairCase {
  return {
    id: r.id as string,
    shopId: r.shop_id as string,
    jobCardId: r.job_card_id as string | undefined,
    repairOrderId: r.repair_order_id as string | undefined,
    roNumber: r.ro_number as string | undefined,
    vehicleId: r.vehicle_id as string | undefined,
    customerId: r.customer_id as string | undefined,
    vin: r.vin as string | undefined,
    make: r.make as string | undefined,
    model: r.model as string | undefined,
    year: r.year as string | undefined,
    engine: r.engine as string | undefined,
    transmission: r.transmission as string | undefined,
    mileage: r.mileage as number | undefined,
    complaint: r.complaint as string | undefined,
    technicianNotes: r.technician_notes as string | undefined,
    finalFix: r.final_fix as string | undefined,
    lessonLearned: r.lesson_learned as string | undefined,
    laborHours: r.labor_hours as number | undefined,
    confidenceScore: r.confidence_score as number | undefined,
    verificationStatus: ((r.verification_status as string) || 'pending') as VerificationStatus,
    isAnonymized: (r.is_anonymized as boolean) ?? true,
    shareToNetwork: (r.share_to_network as boolean) ?? false,
    createdBy: r.created_by as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRepairCaseFromJob(params: Partial<RepairCase>): Promise<RepairCase> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const { data, error } = await supabase
    .from('repair_cases')
    .insert({
      shop_id: shopId,
      job_card_id: params.jobCardId ?? null,
      repair_order_id: params.repairOrderId ?? null,
      ro_number: params.roNumber ?? null,
      vehicle_id: params.vehicleId ?? null,
      customer_id: params.customerId ?? null,
      vin: params.vin ?? null,
      make: params.make ?? null,
      model: params.model ?? null,
      year: params.year ?? null,
      engine: params.engine ?? null,
      transmission: params.transmission ?? null,
      mileage: params.mileage ?? null,
      complaint: params.complaint ?? null,
      technician_notes: params.technicianNotes ?? null,
      final_fix: params.finalFix ?? null,
      lesson_learned: params.lessonLearned ?? null,
      labor_hours: params.laborHours ?? null,
      confidence_score: params.confidenceScore ?? null,
      verification_status: params.verificationStatus ?? 'pending',
      is_anonymized: params.isAnonymized ?? true,
      share_to_network: params.shareToNetwork ?? false,
    })
    .select()
    .single();
  if (error) { logger.error('createRepairCaseFromJob failed', error, { module: 'repairCaseService' }); throw new Error(error.message); }
  const newCase = mapCase(data);
  mapRepairCaseById(newCase.id, shopId).catch(e => {
    logger.error('Knowledge graph mapping failed (non-fatal)', e, { module: 'repairCaseService', repairCaseId: newCase.id });
  });
  return newCase;
}

export async function updateRepairCase(id: string, params: Partial<RepairCase>): Promise<RepairCase> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const patch: Record<string, unknown> = {};
  if (params.vin !== undefined)          patch.vin = params.vin;
  if (params.make !== undefined)         patch.make = params.make;
  if (params.model !== undefined)        patch.model = params.model;
  if (params.year !== undefined)         patch.year = params.year;
  if (params.engine !== undefined)       patch.engine = params.engine;
  if (params.transmission !== undefined) patch.transmission = params.transmission;
  if (params.mileage !== undefined)      patch.mileage = params.mileage;
  if (params.complaint !== undefined)    patch.complaint = params.complaint;
  if (params.technicianNotes !== undefined) patch.technician_notes = params.technicianNotes;
  if (params.finalFix !== undefined)     patch.final_fix = params.finalFix;
  if (params.lessonLearned !== undefined) patch.lesson_learned = params.lessonLearned;
  if (params.laborHours !== undefined)   patch.labor_hours = params.laborHours;
  if (params.confidenceScore !== undefined) patch.confidence_score = params.confidenceScore;
  if (params.verificationStatus !== undefined) patch.verification_status = params.verificationStatus;
  if (params.isAnonymized !== undefined) patch.is_anonymized = params.isAnonymized;
  if (params.shareToNetwork !== undefined) patch.share_to_network = params.shareToNetwork;

  const { data, error } = await supabase
    .from('repair_cases')
    .update(patch)
    .eq('id', id)
    .eq('shop_id', shopId)
    .select()
    .single();
  if (error) { logger.error('updateRepairCase failed', error, { module: 'repairCaseService' }); throw new Error(error.message); }
  return mapCase(data);
}

export async function updateVerificationStatus(id: string, status: VerificationStatus): Promise<RepairCase> {
  return updateRepairCase(id, { verificationStatus: status });
}

export async function fetchRepairCaseWithDetails(id: string): Promise<RepairCaseWithDetails | null> {
  const shopId = getShopId();
  if (!shopId) return null;
  const [
    { data: caseData, error: caseErr },
    { data: dtcData },
    { data: symptomData },
    { data: testData },
    { data: partData },
    { data: outcomeData },
  ] = await Promise.all([
    supabase.from('repair_cases').select('*').eq('id', id).eq('shop_id', shopId).single(),
    supabase.from('repair_case_dtcs').select('*').eq('repair_case_id', id).eq('shop_id', shopId),
    supabase.from('repair_case_symptoms').select('*').eq('repair_case_id', id).eq('shop_id', shopId),
    supabase.from('repair_case_tests').select('*').eq('repair_case_id', id).eq('shop_id', shopId),
    supabase.from('repair_case_parts').select('*').eq('repair_case_id', id).eq('shop_id', shopId),
    supabase.from('repair_case_outcomes').select('*').eq('repair_case_id', id).eq('shop_id', shopId),
  ]);
  if (caseErr || !caseData) return null;
  return {
    ...mapCase(caseData),
    dtcs: (dtcData ?? []).map(r => ({ id: r.id, shopId: r.shop_id, repairCaseId: r.repair_case_id, code: r.code, description: r.description, module: r.module, status: r.status })),
    symptoms: (symptomData ?? []).map(r => ({ id: r.id, shopId: r.shop_id, repairCaseId: r.repair_case_id, symptom: r.symptom, severity: r.severity })),
    tests: (testData ?? []).map(r => ({ id: r.id, shopId: r.shop_id, repairCaseId: r.repair_case_id, testName: r.test_name, result: r.result, passed: r.passed, notes: r.notes })),
    parts: (partData ?? []).map(r => ({ id: r.id, shopId: r.shop_id, repairCaseId: r.repair_case_id, partName: r.part_name, partNumber: r.part_number, supplier: r.supplier, cost: r.cost, replaced: r.replaced })),
    outcomes: (outcomeData ?? []).map(r => ({ id: r.id, shopId: r.shop_id, repairCaseId: r.repair_case_id, outcome: r.outcome, comeback: r.comeback, comebackDays: r.comeback_days, warrantyClaim: r.warranty_claim, customerSatisfied: r.customer_satisfied, verifiedFix: r.verified_fix })),
  };
}

export async function listRepairCases(): Promise<RepairCase[]> {
  const shopId = getShopId();
  if (!shopId) return [];
  const { data, error } = await supabase
    .from('repair_cases')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listRepairCases failed', error, { module: 'repairCaseService' }); throw new Error(error.message); }
  return (data ?? []).map(mapCase);
}

export async function getRepairCaseById(id: string): Promise<RepairCase | null> {
  const shopId = getShopId();
  if (!shopId) return null;
  const { data, error } = await supabase
    .from('repair_cases')
    .select('*')
    .eq('id', id)
    .eq('shop_id', shopId)
    .single();
  if (error) return null;
  return mapCase(data);
}

// ─── DTCs ─────────────────────────────────────────────────────────────────────

export async function addDtcToRepairCase(repairCaseId: string, dtc: Omit<RepairCaseDtc, 'id' | 'shopId' | 'repairCaseId'>): Promise<RepairCaseDtc> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const { data, error } = await supabase
    .from('repair_case_dtcs')
    .insert({ shop_id: shopId, repair_case_id: repairCaseId, code: dtc.code, description: dtc.description ?? null, module: dtc.module ?? null, status: dtc.status ?? null })
    .select().single();
  if (error) throw error;
  return { id: data.id, shopId: data.shop_id, repairCaseId: data.repair_case_id, code: data.code, description: data.description, module: data.module, status: data.status };
}

// ─── Symptoms ─────────────────────────────────────────────────────────────────

export async function addSymptomToRepairCase(repairCaseId: string, symptom: string, severity?: string): Promise<RepairCaseSymptom> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const { data, error } = await supabase
    .from('repair_case_symptoms')
    .insert({ shop_id: shopId, repair_case_id: repairCaseId, symptom, severity: severity ?? null })
    .select().single();
  if (error) throw error;
  return { id: data.id, shopId: data.shop_id, repairCaseId: data.repair_case_id, symptom: data.symptom, severity: data.severity };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

export async function addTestToRepairCase(repairCaseId: string, test: Omit<RepairCaseTest, 'id' | 'shopId' | 'repairCaseId'>): Promise<RepairCaseTest> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const { data, error } = await supabase
    .from('repair_case_tests')
    .insert({ shop_id: shopId, repair_case_id: repairCaseId, test_name: test.testName, result: test.result ?? null, passed: test.passed ?? null, notes: test.notes ?? null })
    .select().single();
  if (error) throw error;
  return { id: data.id, shopId: data.shop_id, repairCaseId: data.repair_case_id, testName: data.test_name, result: data.result, passed: data.passed, notes: data.notes };
}

// ─── Parts ────────────────────────────────────────────────────────────────────

export async function addPartToRepairCase(repairCaseId: string, part: Omit<RepairCasePart, 'id' | 'shopId' | 'repairCaseId'>): Promise<RepairCasePart> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const { data, error } = await supabase
    .from('repair_case_parts')
    .insert({ shop_id: shopId, repair_case_id: repairCaseId, part_name: part.partName, part_number: part.partNumber ?? null, supplier: part.supplier ?? null, cost: part.cost ?? null, replaced: part.replaced ?? true })
    .select().single();
  if (error) throw error;
  return { id: data.id, shopId: data.shop_id, repairCaseId: data.repair_case_id, partName: data.part_name, partNumber: data.part_number, supplier: data.supplier, cost: data.cost, replaced: data.replaced };
}

// ─── Outcomes ─────────────────────────────────────────────────────────────────

export async function addOutcomeToRepairCase(repairCaseId: string, outcome: Omit<RepairCaseOutcome, 'id' | 'shopId' | 'repairCaseId'>): Promise<RepairCaseOutcome> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop selected');
  const { data, error } = await supabase
    .from('repair_case_outcomes')
    .insert({ shop_id: shopId, repair_case_id: repairCaseId, outcome: outcome.outcome, comeback: outcome.comeback ?? false, comeback_days: outcome.comebackDays ?? null, warranty_claim: outcome.warrantyClaim ?? false, customer_satisfied: outcome.customerSatisfied ?? null, verified_fix: outcome.verifiedFix ?? false })
    .select().single();
  if (error) throw error;
  return { id: data.id, shopId: data.shop_id, repairCaseId: data.repair_case_id, outcome: data.outcome, comeback: data.comeback, comebackDays: data.comeback_days, warrantyClaim: data.warranty_claim, customerSatisfied: data.customer_satisfied, verifiedFix: data.verified_fix };
}
