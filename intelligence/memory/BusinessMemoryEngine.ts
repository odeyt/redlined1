// SI-9: Business Memory Engine
// Deterministic extraction of operational patterns.
// No AI. No external calls. Never blocks workflows.

import type {
  BusinessMemoryItem,
  MemoryEntityType,
  MemoryExtractionResult,
  MemoryImportance,
  MemorySummary,
  MemoryType,
} from './types';
import {
  ruleCustomerLastVisit,
  ruleCustomerAverageSpend,
  ruleCustomerUnpaidBalance,
  ruleDeclinedWork,
  ruleVehicleRepeatConcern,
  ruleVehicleRepairHistory,
  ruleVehicleComebackRisk,
  ruleTechnicianStrengths,
  rulePartsPattern,
  ruleMissingRepairIntelligence,
  ruleRevenueOpportunity,
  ruleShopPattern,
} from './MemoryRules';

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

// ── DB row → BusinessMemoryItem ───────────────────────────────

function mapRow(r: Record<string, unknown>): BusinessMemoryItem {
  return {
    id:           r.id as string,
    shopId:       r.shop_id as string,
    memoryType:   r.memory_type as MemoryType,
    entityType:   r.entity_type as MemoryEntityType,
    entityId:     (r.entity_id as string | null) ?? null,
    title:        r.title as string,
    summary:      (r.summary as string | null) ?? null,
    importance:   r.importance as MemoryImportance,
    confidence:   Number(r.confidence ?? 0),
    sourceType:   (r.source_type as string | null) ?? null,
    sourceId:     (r.source_id as string | null) ?? null,
    firstSeenAt:  r.first_seen_at as string,
    lastSeenAt:   r.last_seen_at as string,
    metadata:     (r.metadata as Record<string, unknown>) ?? {},
    isActive:     r.is_active as boolean,
    createdAt:    r.created_at as string,
    updatedAt:    r.updated_at as string,
  };
}

// ── Upsert ────────────────────────────────────────────────────

type MemoryDraft = Omit<BusinessMemoryItem, 'id' | 'createdAt' | 'updatedAt'>;

export async function upsertMemoryItem(
  draft: MemoryDraft,
  dryRun = false,
): Promise<{ created: boolean }> {
  if (dryRun) return { created: false };
  try {
    const db = await getDb();
    // Match on shop+entity+memoryType+title to avoid duplicates
    const { data: existing } = await db
      .from('business_memory_items')
      .select('id, first_seen_at')
      .eq('shop_id', draft.shopId)
      .eq('memory_type', draft.memoryType)
      .eq('entity_type', draft.entityType)
      .eq('title', draft.title)
      .eq('is_active', true)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      await db
        .from('business_memory_items')
        .update({
          summary:      draft.summary,
          importance:   draft.importance,
          confidence:   draft.confidence,
          last_seen_at: now,
          metadata:     draft.metadata,
          updated_at:   now,
        })
        .eq('id', (existing as Record<string, string>).id);
      return { created: false };
    }

    await db.from('business_memory_items').insert({
      shop_id:       draft.shopId,
      memory_type:   draft.memoryType,
      entity_type:   draft.entityType,
      entity_id:     draft.entityId,
      title:         draft.title,
      summary:       draft.summary,
      importance:    draft.importance,
      confidence:    draft.confidence,
      source_type:   draft.sourceType,
      source_id:     draft.sourceId,
      first_seen_at: now,
      last_seen_at:  now,
      metadata:      draft.metadata,
      is_active:     true,
      created_at:    now,
      updated_at:    now,
    });
    return { created: true };
  } catch { return { created: false }; }
}

async function saveDrafts(
  drafts: MemoryDraft[],
  dryRun: boolean,
  result: MemoryExtractionResult,
): Promise<void> {
  for (const d of drafts) {
    try {
      const { created } = await upsertMemoryItem(d, dryRun);
      if (created) result.itemsCreated++;
      else result.itemsUpdated++;
    } catch (e) {
      result.warnings.push(`upsert failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }
}

// ── Link ──────────────────────────────────────────────────────

export async function linkMemoryToEntity(
  memoryId: string,
  entityType: MemoryEntityType,
  entityId: string,
  shopId: string,
  relationshipType = 'related_repair',
): Promise<void> {
  try {
    const db = await getDb();
    await db.from('business_memory_links').insert({
      shop_id:            shopId,
      memory_item_id:     memoryId,
      linked_entity_type: entityType,
      linked_entity_id:   entityId,
      relationship_type:  relationshipType,
      created_at:         new Date().toISOString(),
    });
  } catch { /* fail silently */ }
}

// ── Query ─────────────────────────────────────────────────────

export async function getMemoryForEntity(
  shopId: string,
  entityType: MemoryEntityType,
  entityId: string,
): Promise<BusinessMemoryItem[]> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('business_memory_items')
      .select('*')
      .eq('shop_id', shopId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .order('confidence', { ascending: false })
      .limit(20);
    return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  } catch { return []; }
}

export async function getImportantMemory(
  shopId: string,
  limit = 30,
): Promise<BusinessMemoryItem[]> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('business_memory_items')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .in('importance', ['critical', 'high'])
      .order('importance', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  } catch { return []; }
}

export async function archiveOldMemory(shopId: string, olderThanDays = 90): Promise<void> {
  try {
    const db = await getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await db
      .from('business_memory_items')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('shop_id', shopId)
      .lt('last_seen_at', cutoff.toISOString())
      .in('importance', ['low', 'medium']);
  } catch { /* fail silently */ }
}

// ── Snapshot ──────────────────────────────────────────────────

export async function buildMemorySnapshot(
  shopId: string,
  entityType: MemoryEntityType,
  entityId: string,
): Promise<void> {
  try {
    const db = await getDb();
    const items = await getMemoryForEntity(shopId, entityType, entityId);
    await db.from('business_memory_snapshots').insert({
      shop_id:       shopId,
      entity_type:   entityType,
      entity_id:     entityId,
      snapshot_type: 'full',
      snapshot_date: new Date().toISOString().split('T')[0],
      snapshot:      { items: items.map(i => ({ id: i.id, title: i.title, importance: i.importance })) },
      created_at:    new Date().toISOString(),
    });
  } catch { /* fail silently */ }
}

// ── Customer Extraction ───────────────────────────────────────

export async function extractCustomerMemory(
  shopId: string,
  customerId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };

  try {
    const db = await getDb();

    // Last visit
    const { data: lastJob } = await db
      .from('job_cards')
      .select('completed_at')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .eq('status', 'complete')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastVisit = (lastJob as Record<string, string> | null)?.completed_at ?? null;
    const lv = ruleCustomerLastVisit(shopId, customerId, lastVisit);
    if (lv) await saveDrafts([lv], dryRun, result);

    // Average spend + unpaid balance
    const { data: invoices } = await db
      .from('invoices')
      .select('total, status, created_at')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId);
    if (invoices) {
      const rows = invoices as Array<{ total?: number; status?: string }>;
      const paidTotals = rows.filter(r => r.status === 'paid' && r.total != null).map(r => Number(r.total));
      const avg = ruleCustomerAverageSpend(shopId, customerId, paidTotals);
      if (avg) await saveDrafts([avg], dryRun, result);

      const unpaid = rows.filter(r => r.status !== 'paid');
      const unpaidCount = unpaid.length;
      const unpaidTotal = unpaid.reduce((s, r) => s + Number(r.total ?? 0), 0);
      const ub = ruleCustomerUnpaidBalance(shopId, customerId, unpaidCount, unpaidTotal);
      if (ub) await saveDrafts([ub], dryRun, result);
    }

    // Declined estimates
    const { data: declinedEst } = await db
      .from('estimates')
      .select('id, title, total, updated_at')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .eq('status', 'declined');
    if (declinedEst && (declinedEst as unknown[]).length > 0) {
      const declined = (declinedEst as Array<Record<string, unknown>>).map(e => ({
        id: String(e.id ?? ''),
        title: String(e.title ?? 'Estimate'),
        total: Number(e.total ?? 0),
        declinedAt: String(e.updated_at ?? new Date().toISOString()),
      }));
      const dw = ruleDeclinedWork(shopId, customerId, declined);
      await saveDrafts(dw, dryRun, result);
    }
  } catch (e) {
    result.warnings.push(`Customer ${customerId}: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Vehicle Extraction ────────────────────────────────────────

export async function extractVehicleMemory(
  shopId: string,
  vehicleId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };

  try {
    const db = await getDb();

    // Repair history counts
    const { count: jobCount } = await db
      .from('job_cards')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .eq('status', 'complete');
    const { count: caseCount } = await db
      .from('repair_cases')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);
    const { data: firstJob } = await db
      .from('job_cards')
      .select('created_at')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const rh = ruleVehicleRepairHistory(
      shopId, vehicleId,
      jobCount ?? 0,
      caseCount ?? 0,
      (firstJob as Record<string, string> | null)?.created_at ?? null,
    );
    if (rh) await saveDrafts([rh], dryRun, result);

    // Repeat concerns from repair cases
    const { data: cases } = await db
      .from('repair_cases')
      .select('concern_category, created_at')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);
    if (cases && (cases as unknown[]).length > 0) {
      const catMap: Record<string, { count: number; lastSeen: string }> = {};
      for (const c of cases as Array<{ concern_category?: string; created_at?: string }>) {
        const cat = c.concern_category ?? 'General';
        if (!catMap[cat]) catMap[cat] = { count: 0, lastSeen: c.created_at ?? '' };
        catMap[cat].count++;
        if ((c.created_at ?? '') > catMap[cat].lastSeen) catMap[cat].lastSeen = c.created_at ?? '';
      }
      const concerns = Object.entries(catMap).map(([category, v]) => ({ category, ...v }));
      const rc = ruleVehicleRepeatConcern(shopId, vehicleId, concerns);
      await saveDrafts(rc, dryRun, result);
    }

    // Comeback risk — warranty/comeback repair orders
    const { data: comebacks } = await db
      .from('repair_orders')
      .select('id, created_at')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .eq('is_warranty', true);
    if (comebacks) {
      const rows = comebacks as Array<{ id: string; created_at: string }>;
      const lastDate = rows.length > 0 ? rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0].created_at : null;
      const cr = ruleVehicleComebackRisk(shopId, vehicleId, rows.length, lastDate);
      if (cr) await saveDrafts([cr], dryRun, result);
    }
  } catch (e) {
    result.warnings.push(`Vehicle ${vehicleId}: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Repair Memory ─────────────────────────────────────────────

export async function extractRepairMemory(
  shopId: string,
  repairCaseId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };
  // Repair-level memory is captured during vehicle extraction.
  // Individual case linking happens via linkMemoryToEntity.
  result.durationMs = Date.now() - start;
  return result;
}

// ── Revenue Memory ────────────────────────────────────────────

export async function extractRevenueMemory(
  shopId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };

  try {
    const db = await getDb();

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 14);

    const { data: stale } = await db
      .from('estimates')
      .select('total')
      .eq('shop_id', shopId)
      .eq('status', 'pending')
      .lt('updated_at', staleDate.toISOString());
    const staleEstimates = (stale ?? []) as Array<{ total?: number }>;
    const staleTotal = staleEstimates.reduce((s, e) => s + Number(e.total ?? 0), 0);

    const { data: notInvoiced } = await db
      .from('job_cards')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('status', 'complete')
      .is('invoice_id', null);

    const { data: overdueInv } = await db
      .from('invoices')
      .select('total')
      .eq('shop_id', shopId)
      .neq('status', 'paid')
      .lt('due_date', new Date().toISOString());
    const overdueRows = (overdueInv ?? []) as Array<{ total?: number }>;
    const overdueTotal = overdueRows.reduce((s, i) => s + Number(i.total ?? 0), 0);

    const ro = ruleRevenueOpportunity(
      shopId,
      staleEstimates.length, staleTotal,
      (notInvoiced as unknown as { count?: number } | null)?.count ?? 0,
      overdueRows.length, overdueTotal,
    );
    if (ro) await saveDrafts([ro], dryRun, result);
  } catch (e) {
    result.warnings.push(`Revenue: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Technician Memory ─────────────────────────────────────────

export async function extractTechnicianMemory(
  shopId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };

  try {
    const db = await getDb();
    const { data: techs } = await db
      .from('shop_users')
      .select('user_id')
      .eq('shop_id', shopId)
      .eq('role', 'technician');

    for (const t of (techs ?? []) as Array<{ user_id: string }>) {
      const { data: cases } = await db
        .from('repair_cases')
        .select('concern_category')
        .eq('shop_id', shopId)
        .eq('assigned_technician_id', t.user_id)
        .eq('status', 'resolved');

      if (!cases) continue;
      const catMap: Record<string, number> = {};
      for (const c of cases as Array<{ concern_category?: string }>) {
        const cat = c.concern_category ?? 'General';
        catMap[cat] = (catMap[cat] ?? 0) + 1;
      }
      const stats = Object.entries(catMap).map(([category, verifiedCount]) => ({ category, verifiedCount }));
      const items = ruleTechnicianStrengths(shopId, t.user_id, stats);
      await saveDrafts(items, dryRun, result);
    }
  } catch (e) {
    result.warnings.push(`Technician: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Parts Memory ──────────────────────────────────────────────

export async function extractPartsMemory(
  shopId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };

  try {
    const db = await getDb();
    const { data: usage } = await db
      .from('parts_order_items')
      .select('part_id, part_name, created_at')
      .eq('shop_id', shopId);

    if (usage) {
      const partMap: Record<string, { partName: string; count: number; lastUsed: string }> = {};
      for (const row of usage as Array<{ part_id?: string; part_name?: string; created_at?: string }>) {
        const pid = row.part_id ?? '';
        if (!partMap[pid]) partMap[pid] = { partName: row.part_name ?? '', count: 0, lastUsed: row.created_at ?? '' };
        partMap[pid].count++;
        if ((row.created_at ?? '') > partMap[pid].lastUsed) partMap[pid].lastUsed = row.created_at ?? '';
      }
      const stats = Object.entries(partMap).map(([partId, v]) => ({ partId, partName: v.partName, useCount: v.count, lastUsed: v.lastUsed }));
      const items = rulePartsPattern(shopId, stats);
      await saveDrafts(items, dryRun, result);
    }
  } catch (e) {
    result.warnings.push(`Parts: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Shop-level extraction ─────────────────────────────────────

async function extractShopPatterns(
  shopId: string,
  dryRun: boolean,
  result: MemoryExtractionResult,
): Promise<void> {
  try {
    const db = await getDb();
    const { data: cases } = await db
      .from('repair_cases')
      .select('concern_category, vehicle_id, created_at')
      .eq('shop_id', shopId)
      .gte('created_at', new Date(Date.now() - 90 * 86_400_000).toISOString());

    if (!cases) return;
    const catVehicles: Record<string, Set<string>> = {};
    for (const c of cases as Array<{ concern_category?: string; vehicle_id?: string }>) {
      const cat = c.concern_category ?? 'General';
      const vid = c.vehicle_id ?? '';
      if (!catVehicles[cat]) catVehicles[cat] = new Set();
      if (vid) catVehicles[cat].add(vid);
    }
    const patterns = Object.entries(catVehicles)
      .filter(([, v]) => v.size >= 2)
      .map(([category, v]) => ({
        category,
        vehicleCount: v.size,
        description: `${v.size} vehicles presented with ${category} concerns in the last 90 days.`,
      }));
    const items = ruleShopPattern(shopId, patterns);
    await saveDrafts(items, dryRun, result);
  } catch { /* fail silently */ }
}

async function extractMissingRepairCases(
  shopId: string,
  dryRun: boolean,
  result: MemoryExtractionResult,
): Promise<void> {
  try {
    const db = await getDb();
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: jobs } = await db
      .from('job_cards')
      .select('id, completed_at')
      .eq('shop_id', shopId)
      .eq('status', 'complete')
      .is('repair_case_id', null)
      .gte('completed_at', cutoff)
      .limit(20);

    if (jobs && (jobs as unknown[]).length > 0) {
      const rows = (jobs as Array<{ id: string; completed_at: string }>);
      const items = ruleMissingRepairIntelligence(shopId, rows.map(r => ({ jobId: r.id, completedAt: r.completed_at })));
      await saveDrafts(items, dryRun, result);
    }
  } catch { /* fail silently */ }
}

// ── Full Shop Extraction ──────────────────────────────────────

export async function extractMemoryForShop(
  shopId: string,
  dryRun = false,
): Promise<MemoryExtractionResult> {
  const start = Date.now();
  const result: MemoryExtractionResult = {
    shopId, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, durationMs: 0, warnings: [], dryRun,
  };

  try {
    // Revenue memory
    const rev = await extractRevenueMemory(shopId, dryRun);
    result.itemsCreated += rev.itemsCreated;
    result.itemsUpdated += rev.itemsUpdated;
    result.warnings.push(...rev.warnings);

    // Shop patterns
    await extractShopPatterns(shopId, dryRun, result);

    // Missing repair cases
    await extractMissingRepairCases(shopId, dryRun, result);

    // Technician memory
    const tech = await extractTechnicianMemory(shopId, dryRun);
    result.itemsCreated += tech.itemsCreated;
    result.itemsUpdated += tech.itemsUpdated;
    result.warnings.push(...tech.warnings);

    // Parts memory
    const parts = await extractPartsMemory(shopId, dryRun);
    result.itemsCreated += parts.itemsCreated;
    result.itemsUpdated += parts.itemsUpdated;
    result.warnings.push(...parts.warnings);

    // Per-customer: load all customer IDs, extract top 50 by activity
    const db = await getDb();
    const { data: customers } = await db
      .from('customers')
      .select('id')
      .eq('shop_id', shopId)
      .limit(50);
    for (const c of (customers ?? []) as Array<{ id: string }>) {
      const cr = await extractCustomerMemory(shopId, c.id, dryRun);
      result.itemsCreated += cr.itemsCreated;
      result.itemsUpdated += cr.itemsUpdated;
      result.warnings.push(...cr.warnings);
    }

    // Per-vehicle: top 50
    const { data: vehicles } = await db
      .from('vehicles')
      .select('id')
      .eq('shop_id', shopId)
      .limit(50);
    for (const v of (vehicles ?? []) as Array<{ id: string }>) {
      const vr = await extractVehicleMemory(shopId, v.id, dryRun);
      result.itemsCreated += vr.itemsCreated;
      result.itemsUpdated += vr.itemsUpdated;
      result.warnings.push(...vr.warnings);
    }
  } catch (e) {
    result.warnings.push(`Shop extraction: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Summary ───────────────────────────────────────────────────

export async function getMemorySummary(shopId: string): Promise<MemorySummary> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('business_memory_items')
      .select('id, importance, memory_type')
      .eq('shop_id', shopId)
      .eq('is_active', true);

    const rows = (data ?? []) as Array<{ id: string; importance: string; memory_type: string }>;
    const byType: Partial<Record<MemoryType, number>> = {};
    let critical = 0, high = 0, medium = 0, low = 0;
    for (const r of rows) {
      byType[r.memory_type as MemoryType] = (byType[r.memory_type as MemoryType] ?? 0) + 1;
      if (r.importance === 'critical') critical++;
      else if (r.importance === 'high') high++;
      else if (r.importance === 'medium') medium++;
      else low++;
    }

    const topItems = await getImportantMemory(shopId, 10);

    return {
      shopId,
      totalItems: rows.length,
      criticalCount: critical,
      highCount: high,
      mediumCount: medium,
      lowCount: low,
      byType,
      topItems,
      extractedAt: new Date().toISOString(),
    };
  } catch {
    return {
      shopId, totalItems: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
      byType: {}, topItems: [], extractedAt: new Date().toISOString(),
    };
  }
}
