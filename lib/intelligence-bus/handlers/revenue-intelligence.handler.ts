/**
 * lib/intelligence-bus/handlers/revenue-intelligence.handler.ts
 *
 * Revenue Intelligence Engine subscriber.
 *
 * Subscribes to:
 *   repair.verified, estimate.approved, invoice.paid
 */

import type { RibEventBus } from '../bus';
import type {
  RepairVerifiedEvent,
  EstimateApprovedEvent,
  InvoicePaidEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerRevenueIntelligenceHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'revenue_intelligence',
    'Revenue Intelligence Engine',
    [
      'repair.verified',
      'estimate.approved',
      'invoice.paid',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'repair.verified':
          await handleRepairVerified(event as RepairVerifiedEvent);
          break;
        case 'estimate.approved':
          await handleEstimateApproved(event as EstimateApprovedEvent);
          break;
        case 'invoice.paid':
          await handleInvoicePaid(event as InvoicePaidEvent);
          break;
      }
    },
  );
}

async function handleRepairVerified(event: RepairVerifiedEvent): Promise<void> {
  console.log('[Revenue] repair verified — updating revenue pipeline', {
    shopId: event.shopId,
    totalCost: event.totalCost,
    outcome: event.outcomeStatus,
    customerId: event.customerId,
  });
}

async function handleEstimateApproved(event: EstimateApprovedEvent): Promise<void> {
  console.log('[Revenue] estimate approved', {
    shopId: event.shopId,
    estimateId: event.estimateId,
    amount: event.approvedAmount,
    currency: event.currency,
  });
}

async function handleInvoicePaid(event: InvoicePaidEvent): Promise<void> {
  console.log('[Revenue] invoice paid', {
    shopId: event.shopId,
    invoiceId: event.invoiceId,
    amount: event.amount,
    customerId: event.customerId,
    method: event.paymentMethod,
  });
}
