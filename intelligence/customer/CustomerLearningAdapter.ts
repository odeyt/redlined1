// SI-13: Customer Learning Adapter
// Connects outcome recording to the learning engine (SI-11).
// All calls wrapped in try/catch — never throws to caller.

import { supabase } from '@/lib/supabase';

interface OutcomeInput {
  shopId: string;
  customerId: string;
  opportunityType: string;
  signalId?: string | null;
  outcomeStatus: string;
  expectedRevenue?: number | null;
  realizedRevenue?: number | null;
  actionTaken?: string | null;
  verifiedBy?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordCustomerOpportunityOutcome(input: OutcomeInput): Promise<void> {
  try {
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'customer_intelligence_outcome_tracking')
      .maybeSingle();

    if (!flag?.enabled) return;

    void supabase.from('customer_opportunity_outcomes').insert({
      shop_id: input.shopId,
      customer_id: input.customerId,
      signal_id: input.signalId ?? null,
      opportunity_type: input.opportunityType,
      outcome_status: input.outcomeStatus,
      expected_revenue: input.expectedRevenue ?? null,
      realized_revenue: input.realizedRevenue ?? null,
      action_taken: input.actionTaken ?? null,
      verified_by: input.verifiedBy ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Never throw to caller
  }
}

export async function recordCustomerIntelligenceEvent(
  shopId: string,
  customerId: string,
  eventType: string,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
  title: string | null,
  summary: string | null,
  amount: number | null
): Promise<void> {
  try {
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'customer_lifetime_intelligence')
      .maybeSingle();

    if (!flag?.enabled) return;

    void supabase.from('customer_intelligence_events').insert({
      shop_id: shopId,
      customer_id: customerId,
      event_type: eventType,
      source_entity_type: sourceEntityType,
      source_entity_id: sourceEntityId,
      event_date: new Date().toISOString(),
      title,
      summary,
      amount,
      metadata: {},
    });
  } catch {
    // Never throw to caller
  }
}
