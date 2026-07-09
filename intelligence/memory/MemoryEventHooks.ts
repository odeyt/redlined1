// SI-9: Business Memory Event Hooks
// Fire-and-forget memory refresh after key operational events.
// NEVER blocks workflows. NEVER throws to caller.

async function isFlagEnabled(flagKey: string): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const { data } = await getAdminDb()
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', flagKey)
      .maybeSingle();
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return false; }
}

async function refreshCustomerMemory(shopId: string, customerId: string): Promise<void> {
  const { extractCustomerMemory } = await import('./BusinessMemoryEngine');
  await extractCustomerMemory(shopId, customerId);
}

async function refreshVehicleMemory(shopId: string, vehicleId: string): Promise<void> {
  const { extractVehicleMemory } = await import('./BusinessMemoryEngine');
  await extractVehicleMemory(shopId, vehicleId);
}

async function refreshRevenueMemory(shopId: string): Promise<void> {
  const { extractRevenueMemory } = await import('./BusinessMemoryEngine');
  await extractRevenueMemory(shopId);
}

// ── Public hooks (call fire-and-forget: void onXxx(...)) ─────

/** Call after an invoice is paid. */
export function onInvoicePaid(shopId: string, customerId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshCustomerMemory(shopId, customerId);
      await refreshRevenueMemory(shopId);
    } catch { /* never propagate */ }
  })();
}

/** Call after an estimate is declined. */
export function onEstimateDeclined(shopId: string, customerId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshCustomerMemory(shopId, customerId);
    } catch { /* never propagate */ }
  })();
}

/** Call after an estimate is approved. */
export function onEstimateApproved(shopId: string, customerId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshCustomerMemory(shopId, customerId);
    } catch { /* never propagate */ }
  })();
}

/** Call after a job card is created. */
export function onJobCardCreated(shopId: string, vehicleId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshVehicleMemory(shopId, vehicleId);
    } catch { /* never propagate */ }
  })();
}

/** Call after a repair order is completed. */
export function onRepairOrderCompleted(shopId: string, vehicleId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshVehicleMemory(shopId, vehicleId);
    } catch { /* never propagate */ }
  })();
}

/** Call after a repair case is created. */
export function onRepairCaseCreated(shopId: string, vehicleId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshVehicleMemory(shopId, vehicleId);
    } catch { /* never propagate */ }
  })();
}

/** Call after a payment is recorded. */
export function onPaymentRecorded(shopId: string, customerId: string): void {
  void (async () => {
    try {
      if (!await isFlagEnabled('business_memory_engine')) return;
      await refreshCustomerMemory(shopId, customerId);
      await refreshRevenueMemory(shopId);
    } catch { /* never propagate */ }
  })();
}
