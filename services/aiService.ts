import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { AiTaskType } from '@/lib/ai/prompts';

export interface AiResponse<T = Record<string, unknown>> {
  result: T;
  mock: boolean;
  model: string;
  error?: string;
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function callAi<T>(type: AiTaskType, context: Record<string, unknown>): Promise<AiResponse<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // shopId attributes the request for usage metering. Without it the server
    // cannot count the call against anyone, and the daily-limit check refuses
    // it — which is what broke every AI request when metering was introduced:
    // this client had never sent one.
    body: JSON.stringify({ type, context, shopId: getShopId() || undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `AI request failed (${res.status})`);
  }

  return res.json();
}

// ─── DTC Explanation ─────────────────────────────────────────────────────────

export interface DtcExplanationResult {
  customerExplanation: string;
  technicianNotes: string;
  urgency: 'immediate' | 'soon' | 'monitor' | 'informational';
  commonFixes: string[];
  disclaimer: string;
}

export async function explainDtc(params: {
  codes: string[];
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  mileage?: number;
  notes?: string;
}): Promise<AiResponse<DtcExplanationResult>> {
  return callAi<DtcExplanationResult>('dtc_explanation', params);
}

// ─── Estimate Draft from Inspection ──────────────────────────────────────────

export interface EstimateLine {
  description: string;
  estimatedHours: number;
  notes: string;
}

export interface EstimateDraftResult {
  lines: EstimateLine[];
  customerNote: string;
  technicianNote: string;
  disclaimer: string;
}

export async function draftEstimateFromInspection(params: {
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  mileage?: number;
  findings: { label: string; finding: string; severity?: string }[];
  laborRate?: number;
  currency?: string;
}): Promise<AiResponse<EstimateDraftResult>> {
  return callAi<EstimateDraftResult>('estimate_draft', params);
}

// ─── Customer Message Draft ───────────────────────────────────────────────────

export interface CustomerMessageResult {
  smsMessage: string;
  emailSubject: string;
  emailBody: string;
  tone: string;
}

export async function draftCustomerMessage(params: {
  customerName: string;
  vehicle?: string;
  messageType?: string;
  status?: string;
  repairStage?: string;
  details?: string;
  shopName?: string;
  channel?: 'SMS' | 'Email';
}): Promise<AiResponse<CustomerMessageResult>> {
  return callAi<CustomerMessageResult>('customer_message', params);
}

// ─── Invoice Summary ──────────────────────────────────────────────────────────

export interface InvoiceSummaryResult {
  invoiceNarrative: string;
  warrantyNote: string;
  followUpRecommendations: string[];
  disclaimer: string;
}

export async function summarizeInvoice(params: {
  customerName?: string;
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  lines: { description: string; qty: number; rate: number }[];
  total?: number;
  currency?: string;
}): Promise<AiResponse<InvoiceSummaryResult>> {
  return callAi<InvoiceSummaryResult>('invoice_summary', params);
}

// ─── Repair Case Summary ──────────────────────────────────────────────────────

export interface RepairCaseSummaryResult {
  title: string;
  summary: string;
  keyFindings: string[];
  confirmedFix: string;
  preventionNote: string;
  confidenceScore: number;
}

export async function summarizeRepairCase(params: {
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  mileage?: number;
  complaint?: string;
  codes?: string[];
  symptoms?: string[];
  tests?: { name: string; result: string }[];
  parts?: { name: string; replaced: boolean }[];
  finalFix?: string;
  outcome?: string;
}): Promise<AiResponse<RepairCaseSummaryResult>> {
  return callAi<RepairCaseSummaryResult>('repair_case_summary', params);
}
