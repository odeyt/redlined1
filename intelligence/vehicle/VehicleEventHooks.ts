// SI-10: Vehicle Intelligence Event Hooks
// All hooks are fire-and-forget. Never throw to callers. Never block workflows.
// Each hook is flag-gated on vehicle_intelligence_engine.

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

async function isEnabled(): Promise<boolean> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'vehicle_intelligence_engine')
      .maybeSingle();
    return !!(data as Record<string, unknown> | null)?.enabled;
  } catch { return false; }
}

async function scheduleRebuild(shopId: string, vehicleId: string): Promise<void> {
  try {
    const { buildVehicleIntelligence } = await import('./VehicleIntelligenceEngine');
    await buildVehicleIntelligence(shopId, vehicleId);
  } catch { /* never propagate */ }
}

async function logEvent(
  shopId: string,
  vehicleId: string,
  eventType: string,
  sourceType: string | null,
  sourceId: string | null,
  summary: string | null,
): Promise<void> {
  try {
    const db = await getDb();
    await db.from('vehicle_intelligence_events').insert({
      shop_id:     shopId,
      vehicle_id:  vehicleId,
      event_type:  eventType,
      source_type: sourceType,
      source_id:   sourceId,
      summary,
      event_date:  new Date().toISOString(),
      metadata:    {},
    });
  } catch { /* never propagate */ }
}

// Hook 1: Job card created/completed
export function onJobCardSaved(shopId: string, vehicleId: string, jobCardId: string, status: string): void {
  void (async () => {
    if (!(await isEnabled())) return;
    await logEvent(shopId, vehicleId, 'job_card_' + status.toLowerCase().replace(/\s+/g, '_'), 'job_card', jobCardId, `Job card ${status}`);
    await scheduleRebuild(shopId, vehicleId);
  })();
}

// Hook 2: Repair case created/resolved
export function onRepairCaseSaved(shopId: string, vehicleId: string, repairCaseId: string, status: string): void {
  void (async () => {
    if (!(await isEnabled())) return;
    await logEvent(shopId, vehicleId, 'repair_case_' + status.toLowerCase(), 'repair_case', repairCaseId, `Repair case ${status}`);
    await scheduleRebuild(shopId, vehicleId);
  })();
}

// Hook 3: Estimate declined
export function onEstimateDeclined(shopId: string, vehicleId: string, estimateId: string): void {
  void (async () => {
    if (!(await isEnabled())) return;
    await logEvent(shopId, vehicleId, 'estimate_declined', 'estimate', estimateId, 'Estimate declined');
    await scheduleRebuild(shopId, vehicleId);
  })();
}

// Hook 4: Invoice paid
export function onInvoicePaid(shopId: string, vehicleId: string, invoiceId: string): void {
  void (async () => {
    if (!(await isEnabled())) return;
    await logEvent(shopId, vehicleId, 'invoice_paid', 'invoice', invoiceId, 'Invoice paid');
    await scheduleRebuild(shopId, vehicleId);
  })();
}

// Hook 5: Repair order created (potential comeback)
export function onRepairOrderCreated(shopId: string, vehicleId: string, repairOrderId: string, isWarranty: boolean): void {
  void (async () => {
    if (!(await isEnabled())) return;
    const type = isWarranty ? 'warranty_repair_order' : 'repair_order_created';
    await logEvent(shopId, vehicleId, type, 'repair_order', repairOrderId, isWarranty ? 'Warranty/comeback repair order' : null);
    await scheduleRebuild(shopId, vehicleId);
  })();
}

// Hook 6: DTC scan recorded
export function onDtcRecorded(shopId: string, vehicleId: string, repairCaseId: string, codes: string[]): void {
  void (async () => {
    if (!(await isEnabled())) return;
    await logEvent(shopId, vehicleId, 'dtc_recorded', 'repair_case', repairCaseId, `DTCs: ${codes.slice(0, 3).join(', ')}`);
    await scheduleRebuild(shopId, vehicleId);
  })();
}

// Hook 7: Parts order completed for vehicle
export function onPartsOrderCompleted(shopId: string, vehicleId: string, partsOrderId: string): void {
  void (async () => {
    if (!(await isEnabled())) return;
    await logEvent(shopId, vehicleId, 'parts_order_completed', 'parts_order', partsOrderId, null);
    // No rebuild — parts data is used but isn't critical to trigger rebuild on each order
  })();
}

// Hook 8: Vehicle record updated (mileage change)
export function onVehicleUpdated(shopId: string, vehicleId: string): void {
  void (async () => {
    if (!(await isEnabled())) return;
    if (!(await isAutoRefreshEnabled())) return;
    await scheduleRebuild(shopId, vehicleId);
  })();
}

async function isAutoRefreshEnabled(): Promise<boolean> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'vehicle_intelligence_auto_refresh')
      .maybeSingle();
    return !!(data as Record<string, unknown> | null)?.enabled;
  } catch { return false; }
}
