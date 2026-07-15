/**
 * lib/intelligence-bus/handlers/revenue-intelligence.handler.ts
 */

import type { RibEventBus } from '../bus';
import type {
  RepairVerifiedEvent,
  EstimateApprovedEvent,
  InvoicePaidEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerRevenueIntelligenceHandler(bus: RibEventBus): RibSubscription {
  const subs = [
    bus.subscribe('repair.verified', async (event: RepairVerifiedEvent) => {
      console.log('[Revenue] repair verified — updating revenue pipeline', { shopId: event.shopId, totalCost: event.totalCost, outcome: event.outcomeStatus, customerId: event.customerId });
    }),
    bus.subscribe('estimate.approved', async (event: EstimateApprovedEvent) => {
      console.log('[Revenue] estimate approved', { shopId: event.shopId, estimateId: event.estimateId, amount: event.approvedAmount, currency: event.currency });
    }),
    bus.subscribe('invoice.paid', async (event: InvoicePaidEvent) => {
      console.log('[Revenue] invoice paid', { shopId: event.shopId, invoiceId: event.invoiceId, amount: event.amount, customerId: event.customerId, method: event.paymentMethod });
    }),
  ];
  return { subscriberId: subs[0].subscriberId, unsubscribe: () => subs.forEach((s) => s.unsubscribe()) };
}
