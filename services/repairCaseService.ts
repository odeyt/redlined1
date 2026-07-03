import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepairCase {
  id: string;
  shopId: string;
  jobCardId?: string;
  repairOrderId?: string;
  vehicleId?: string;
  customerId?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  mileage?: number;
  complaint?: string;
  technicianNotes?: string;
  finalFix?: string;
  confidenceScore?: number;
  isAnonymized: boolean;
  shareToNetwork: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
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
    vehicleId: r.vehicle_id as string | undefined,
    customerId: r.customer_id as string | undefined,
    vin: r.vin as string | undefined,
    make: r.make as string | undefined,
    model: r.model as string | undefined,
    year: r.year as string | undefined,
    engine: r.engine as string | undefined,
    mileage: r.mileage as number | undefined,
    complaint: r.complaint as string | undefined,
    technicianNotes: r.technician_notes as string | undefined,
    finalFix: r.final_fix as string | undefined,
    confidenceScore: r.confidence_score as number | undefined,
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
  const { data, error } = await supabase
    .from('repair_cases')
    .insert({
      shop_id: shopId,
      job_card_id: params.jobCardId ?? null,
      repair_order_id: params.repairOrderId ?? null,
      vehicle_id: params.vehicleId ?? null,
      customer_id: params.customerId ?? null,
      vin: params.vin ?? null,
      make: params.make ?? null,
      model: params.model ?? null,
      year: params.year ?? null,
      engine: params.engine ?? null,
      mileage: params.mileage ?? null,
      complaint: params.complaint ?? null,
      technician_notes: params.technicianNotes ?? null,
      final_fix: params.finalFix ?? null,
      confidence_score: params.confidenceScore ?? null,
      is_anonymized: params.isAnonymized ?? true,
      share_to_network: params.shareToNetwork ?? false,
    })
    .select()
    .single();
  if (error) { logger.error('createRepairCaseFromJob failed', error, { module: 'repairCaseService' }); throw error; }
  return mapCase(data);
}

export async function listRepairCases(): Promise<RepairCase[]> {
  const shopId = getShopId();
  const { data, error } = await supabase
    .from('repair_cases')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listRepairCases failed', error, { module: 'repairCaseService' }); throw error; }
  return (data ?? []).map(mapCase);
}

export async function getRepairCaseById(id: string): Promise<RepairCase | null> {
  const shopId = getShopId();
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
  const { data, error } = await supabase
    .from('repair_case_outcomes')
    .insert({ shop_id: shopId, repair_case_id: repairCaseId, outcome: outcome.outcome, comeback: outcome.comeback ?? false, comeback_days: outcome.comebackDays ?? null, warranty_claim: outcome.warrantyClaim ?? false, customer_satisfied: outcome.customerSatisfied ?? null, verified_fix: outcome.verifiedFix ?? false })
    .select().single();
  if (error) throw error;
  return { id: data.id, shopId: data.shop_id, repairCaseId: data.repair_case_id, outcome: data.outcome, comeback: data.comeback, comebackDays: data.comeback_days, warrantyClaim: data.warranty_claim, customerSatisfied: data.customer_satisfied, verifiedFix: data.verified_fix };
}
