/**
 * Triage Service — Supabase CRUD for triage_sessions table.
 * Follows the same patterns as repairCaseService.ts.
 */

import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { logger } from '@/lib/logger';
import { TriageSession } from '@/lib/triage/QuestionTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriageAnalytics {
  totalSessions: number;
  avgQualityScore: number;
  avgIntakeSeconds: number;
  topCategories: { categoryId: string; count: number }[];
  skippedQuestions: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sessionToRow(s: TriageSession): Record<string, unknown> {
  return {
    shop_id:               s.shopId,
    customer_id:           s.vehicle.customerId ?? null,
    customer_name:         s.vehicle.customerName ?? null,
    vehicle_id:            s.vehicle.vehicleId ?? null,
    vehicle_make:          s.vehicle.make,
    vehicle_model:         s.vehicle.model,
    vehicle_year:          s.vehicle.year,
    vehicle_engine:        s.vehicle.engine,
    vehicle_mileage:       s.vehicle.mileage ? Number(s.vehicle.mileage) : null,
    vehicle_fuel_type:     s.vehicle.fuelType,
    vehicle_transmission:  s.vehicle.transmission,
    category_id:           s.categoryId,
    answers:               s.answers,
    tech_notes:            s.techNotes,
    complaint_summary:     s.complaintSummary,
    inspection_suggestions: s.inspectionSuggestions,
    data_quality_score:    s.dataQualityScore,
    status:                s.status,
    job_card_id:           s.jobCardId ?? null,
  };
}

function rowToSession(row: Record<string, unknown>): TriageSession {
  return {
    id:       row.id as string,
    shopId:   row.shop_id as string,
    vehicle: {
      customerId:   (row.customer_id as string) ?? undefined,
      customerName: (row.customer_name as string) ?? undefined,
      vehicleId:    (row.vehicle_id as string) ?? undefined,
      make:         row.vehicle_make as string,
      model:        row.vehicle_model as string,
      year:         row.vehicle_year as string,
      engine:       row.vehicle_engine as string,
      mileage:      row.vehicle_mileage ? String(row.vehicle_mileage) : '',
      fuelType:     row.vehicle_fuel_type as string,
      transmission: row.vehicle_transmission as string,
    },
    categoryId:          (row.category_id as TriageSession['categoryId']) ?? null,
    answers:             (row.answers as TriageSession['answers']) ?? {},
    techNotes:           (row.tech_notes as TriageSession['techNotes']) ?? {
      additionalObservations: '', customerRequests: '',
      urgency: 'routine', towIn: false, vehicleUnsafe: false, waitingCustomer: false,
    },
    complaintSummary:    (row.complaint_summary as string) ?? '',
    inspectionSuggestions: (row.inspection_suggestions as string[]) ?? [],
    dataQualityScore:    (row.data_quality_score as number) ?? 0,
    status:              (row.status as TriageSession['status']) ?? 'draft',
    jobCardId:           (row.job_card_id as string) ?? undefined,
    createdAt:           row.created_at as string,
    updatedAt:           row.updated_at as string,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function saveTriageSession(session: TriageSession): Promise<TriageSession | null> {
  const shopId = await getShopId();
  if (!shopId) return null;

  const row = { ...sessionToRow(session), shop_id: shopId };

  if (session.id) {
    const { data, error } = await supabase
      .from('triage_sessions')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('shop_id', shopId)
      .select()
      .single();
    if (error) { logger.error('triageService.saveTriageSession (update)', error); return null; }
    return rowToSession(data);
  }

  const { data, error } = await supabase
    .from('triage_sessions')
    .insert(row)
    .select()
    .single();
  if (error) { logger.error('triageService.saveTriageSession (insert)', error); return null; }
  return rowToSession(data);
}

export async function listTriageSessions(limit = 50): Promise<TriageSession[]> {
  const shopId = await getShopId();
  if (!shopId) return [];

  const { data, error } = await supabase
    .from('triage_sessions')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { logger.error('triageService.listTriageSessions', error); return []; }
  return (data ?? []).map(rowToSession);
}

export async function getTriageSession(id: string): Promise<TriageSession | null> {
  const shopId = await getShopId();
  if (!shopId) return null;

  const { data, error } = await supabase
    .from('triage_sessions')
    .select('*')
    .eq('id', id)
    .eq('shop_id', shopId)
    .single();

  if (error) { logger.error('triageService.getTriageSession', error); return null; }
  return rowToSession(data);
}

export async function markTriageConverted(id: string, jobCardId: string): Promise<void> {
  const shopId = await getShopId();
  if (!shopId) return;

  const { error } = await supabase
    .from('triage_sessions')
    .update({ status: 'converted', job_card_id: jobCardId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('shop_id', shopId);

  if (error) logger.error('triageService.markTriageConverted', error);
}

export async function deleteTriageSession(id: string): Promise<void> {
  const shopId = await getShopId();
  if (!shopId) return;

  const { error } = await supabase
    .from('triage_sessions')
    .delete()
    .eq('id', id)
    .eq('shop_id', shopId);

  if (error) logger.error('triageService.deleteTriageSession', error);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getTriageAnalytics(): Promise<TriageAnalytics> {
  const shopId = await getShopId();
  if (!shopId) {
    return { totalSessions: 0, avgQualityScore: 0, avgIntakeSeconds: 0, topCategories: [], skippedQuestions: 0 };
  }

  const { data, error } = await supabase
    .from('triage_sessions')
    .select('category_id, data_quality_score, intake_seconds')
    .eq('shop_id', shopId);

  if (error || !data) {
    return { totalSessions: 0, avgQualityScore: 0, avgIntakeSeconds: 0, topCategories: [], skippedQuestions: 0 };
  }

  const totalSessions    = data.length;
  const avgQualityScore  = totalSessions
    ? Math.round(data.reduce((s, r) => s + (Number(r.data_quality_score) || 0), 0) / totalSessions)
    : 0;
  const avgIntakeSeconds = totalSessions
    ? Math.round(data.reduce((s, r) => s + (Number(r.intake_seconds) || 0), 0) / totalSessions)
    : 0;

  const catCounts: Record<string, number> = {};
  for (const r of data) {
    if (r.category_id) catCounts[r.category_id] = (catCounts[r.category_id] ?? 0) + 1;
  }
  const topCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([categoryId, count]) => ({ categoryId, count }));

  return { totalSessions, avgQualityScore, avgIntakeSeconds, topCategories, skippedQuestions: 0 };
}
