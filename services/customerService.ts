/**
 * Compatibility wrapper. The customer logic now lives in lib/domain/customers.ts.
 *
 * Every exported signature is unchanged, so no view was touched by the move.
 * What each function does now is: build a DomainContext from the browser's
 * shop store, then delegate. That indirection is the point — the same
 * operations are reachable from a route handler, a webhook or an AI tool by
 * building a different context, without any of them reimplementing the rules.
 *
 * New callers inside the browser may keep using these. New callers OUTSIDE the
 * browser must use lib/domain/customers.ts directly.
 */
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { browserDeps } from '@/lib/domain/browserAdapter';
import { createCustomerDomain } from '@/lib/domain/customers';
import type { Customer } from '@/lib/types';

async function domain() {
  return createCustomerDomain(await browserDeps());
}

/**
 * Active customers. Archived ones are excluded unless asked for.
 *
 * Nine screens call this for their customer pickers, and none of them should
 * offer somebody who has been archived — so the default does the right thing
 * for all of them without a single call site changing.
 */
export async function fetchCustomers(
  options: { includeArchived?: boolean } = {},
): Promise<Customer[]> {
  return (await domain()).list(options);
}

/** Archives a customer. Returns null if they are not in this location. */
export async function archiveCustomer(id: string, reason: string): Promise<Customer | null> {
  return (await domain()).archive(id, reason);
}

export async function restoreCustomer(id: string): Promise<Customer | null> {
  return (await domain()).unarchive(id);
}

export async function saveCustomer(customer: Omit<Customer, 'id'>): Promise<Customer> {
  const created = await (await domain()).create({
    name: customer.name,
    type: customer.type,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    tags: customer.tags,
    followUp: customer.followUp,
  });

  // Sapelee stays here rather than in the domain layer: it is an outbound
  // integration, and whether a webhook-initiated or AI-initiated customer
  // creation should also emit to Sapelee is a decision for the event
  // milestone, not a side effect of moving code. Fire-and-forget, never
  // throws. Payload is deliberately id-only — a privacy-scope decision, not an
  // oversight.
  try {
    const { publishSapeleeEvent } = await import('@/lib/sapelee/publish');
    publishSapeleeEvent(supabase, {
      eventType: 'customer.created',
      payload: { customerId: created.id },
      shopId: getShopId(),
      aggregateType: 'customer',
      aggregateId: created.id,
    });
  } catch { /* sapelee integration must never affect production */ }

  return created;
}

export async function updateCustomer(id: string, customer: Omit<Customer, 'id' | 'portalToken'>): Promise<Customer> {
  return (await domain()).update(id, {
    name: customer.name,
    type: customer.type,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    tags: customer.tags,
    followUp: customer.followUp,
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  return (await domain()).remove(id);
}

export async function updateCustomerEmail(customerId: string, email: string): Promise<void> {
  return (await domain()).patch(customerId, { email });
}

export async function updateFollowUp(customerId: string, followUp: string): Promise<void> {
  return (await domain()).patch(customerId, { followUp });
}
