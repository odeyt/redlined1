/**
 * Customer operations, callable from anywhere.
 *
 * Ported from services/customerService.ts without changing behaviour: the same
 * columns, the same id scheme, the same mapping. What changed is where tenancy
 * and the database come from — arguments now, rather than module state — and
 * that mutations record an audit row.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';

export interface DomainCustomer {
  id: string;
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
  tags: string[];
  followUp: string;
  portalToken: string | null;
  /** Set when archived. Null means active. */
  archivedAt: string | null;
  archivedReason: string;
}

export type CustomerInput = Omit<DomainCustomer, 'id' | 'portalToken' | 'archivedAt' | 'archivedReason'>;

function mapRow(row: Record<string, unknown>): DomainCustomer {
  return {
    id: row.id as string,
    name: row.name as string,
    type: (row.type as string) ?? '',
    phone: (row.phone as string) ?? '',
    email: (row.email as string) ?? '',
    address: (row.address as string) ?? '',
    tags: (row.tags as string[]) ?? [],
    followUp: (row.follow_up as string) ?? '',
    portalToken: (row.portal_token as string) ?? null,
    archivedAt: (row.archived_at as string) ?? null,
    archivedReason: (row.archived_reason as string) ?? '',
  };
}

/**
 * The fields worth keeping in an audit snapshot.
 *
 * Not the whole row: a customer record is personal data, and an audit table is
 * read by more people and kept longer than the record itself. Name and contact
 * are what make a change explicable; the address and tags are not needed to
 * answer "who changed what".
 */
function auditView(c: DomainCustomer): Record<string, unknown> {
  return {
    id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email,
    followUp: c.followUp, archivedAt: c.archivedAt,
  };
}

/**
 * A refused delete, in words that say what to do instead.
 *
 * `payments.customer_id` is ON DELETE RESTRICT, so a customer who has ever
 * paid cannot be removed — deliberately, because the alternative was blanking
 * the link and leaving money in the ledger belonging to nobody. Without this
 * translation the person clicking Delete sees a Postgres constraint name and
 * files a bug.
 */
function translateDeleteError(error: { code?: string; message?: string }): Error {
  const message = String(error?.message ?? '');
  if (error?.code === '23503' && message.includes('payments')) {
    return new Error(
      'This customer has payments recorded against them and cannot be deleted — ' +
      'their payment history would be left belonging to nobody. Reverse the ' +
      'payments first if they were entered in error.',
    );
  }
  if (error?.code === '23503') {
    return new Error(
      'This customer still has records attached and cannot be deleted yet.',
    );
  }
  return error as Error;
}

export function createCustomerDomain({ db, context }: DomainDeps) {
  /**
   * Active customers by default.
   *
   * Every picker in the app — job cards, invoices, estimates, appointments —
   * calls this, and none of them should offer a customer somebody has
   * archived. Making exclusion the default rather than an opt-in means those
   * nine call sites get the right behaviour without being touched, and a
   * screen that genuinely wants the archived ones has to say so.
   */
  async function list(options: { includeArchived?: boolean } = {}): Promise<DomainCustomer[]> {
    let query = db
      .from('customers')
      .select('*')
      .in('shop_id', context.shopIds);
    if (!options.includeArchived) query = query.is('archived_at', null);
    const { data, error } = await query.order('name');
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async function get(id: string): Promise<DomainCustomer | null> {
    const { data, error } = await db
      .from('customers')
      .select('*')
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async function create(input: CustomerInput): Promise<DomainCustomer> {
    // Timestamp id, as the existing service does. Changing the scheme would
    // orphan every foreign reference that stores it as text.
    const id = `C-${Date.now()}`;
    const { data, error } = await db
      .from('customers')
      .insert({
        id,
        shop_id: context.shopId,
        name: input.name,
        type: input.type,
        phone: input.phone,
        email: input.email,
        address: input.address,
        tags: input.tags,
        follow_up: input.followUp,
      })
      .select()
      .single();
    if (error) throw error;

    const customer = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.customerCreated,
      entityType: 'customer',
      entityId: customer.id,
      after: auditView(customer),
    });
    return customer;
  }

  async function update(id: string, input: CustomerInput): Promise<DomainCustomer> {
    // Read first so the audit row can say what changed. Two round trips rather
    // than one; an audit that records only the new value cannot answer the
    // question anyone actually asks, which is what it used to be.
    const before = await get(id);

    const { data, error } = await db
      .from('customers')
      .update({
        name: input.name,
        type: input.type,
        phone: input.phone,
        email: input.email,
        address: input.address,
        tags: input.tags,
        follow_up: input.followUp,
      })
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .select()
      .single();
    if (error) throw error;

    const customer = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.customerUpdated,
      entityType: 'customer',
      entityId: id,
      before: before ? auditView(before) : null,
      after: auditView(customer),
    });
    return customer;
  }

  /** Narrow updates the UI makes without opening the whole record. */
  async function patch(id: string, fields: Partial<CustomerInput>): Promise<void> {
    const before = await get(id);
    if (!before) return;

    const payload: Record<string, unknown> = {};
    if (fields.email !== undefined) payload.email = fields.email;
    if (fields.followUp !== undefined) payload.follow_up = fields.followUp;
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.phone !== undefined) payload.phone = fields.phone;
    if (fields.address !== undefined) payload.address = fields.address;
    if (fields.type !== undefined) payload.type = fields.type;
    if (fields.tags !== undefined) payload.tags = fields.tags;
    if (Object.keys(payload).length === 0) return;

    const { error } = await db
      .from('customers')
      .update(payload)
      .eq('id', id)
      .in('shop_id', context.shopIds);
    if (error) throw error;

    await writeAuditEvent(db, context, {
      action: AUDIT.customerUpdated,
      entityType: 'customer',
      entityId: id,
      before: auditView(before),
      after: { ...auditView(before), ...fields },
    });
  }

  /**
   * Takes a customer out of the lists without destroying anything.
   *
   * This is what Delete was standing in for. A customer with invoices, a
   * vehicle or a payment cannot be deleted — those constraints exist so a
   * tidy-up cannot quietly detach or destroy history — but the list still has
   * to be tidyable, so archiving is the real operation and deletion is
   * reserved for records created by mistake.
   */
  async function archive(id: string, reason: string): Promise<DomainCustomer | null> {
    const before = await get(id);
    if (!before) return null;

    const archivedAt = new Date().toISOString();
    const { data, error } = await db
      .from('customers')
      .update({ archived_at: archivedAt, archived_reason: reason.trim() || null })
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .select()
      .single();
    if (error) throw error;

    const customer = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.customerArchived,
      entityType: 'customer',
      entityId: id,
      before: auditView(before),
      after: auditView(customer),
      metadata: { reason: reason.trim() || null },
    });
    return customer;
  }

  async function unarchive(id: string): Promise<DomainCustomer | null> {
    const before = await get(id);
    if (!before) return null;

    const { data, error } = await db
      .from('customers')
      .update({ archived_at: null, archived_reason: null })
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .select()
      .single();
    if (error) throw error;

    const customer = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.customerRestored,
      entityType: 'customer',
      entityId: id,
      before: auditView(before),
      after: auditView(customer),
    });
    return customer;
  }

  /**
   * Permanent deletion. Only succeeds for a customer with nothing attached —
   * every other table now refuses it — so in practice this is for records
   * created by mistake, and the error explains the alternative.
   */
  async function remove(id: string): Promise<void> {
    const before = await get(id);
    const { error } = await db
      .from('customers')
      .delete()
      .eq('id', id)
      .in('shop_id', context.shopIds);
    if (error) throw translateDeleteError(error);

    await writeAuditEvent(db, context, {
      action: AUDIT.customerDeleted,
      entityType: 'customer',
      entityId: id,
      before: before ? auditView(before) : null,
    });
  }

  return { list, get, create, update, patch, archive, unarchive, remove };
}

export type CustomerDomain = ReturnType<typeof createCustomerDomain>;
