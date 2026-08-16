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
}

export type CustomerInput = Omit<DomainCustomer, 'id' | 'portalToken'>;

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
  return { id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email, followUp: c.followUp };
}

export function createCustomerDomain({ db, context }: DomainDeps) {
  async function list(): Promise<DomainCustomer[]> {
    const { data, error } = await db
      .from('customers')
      .select('*')
      .in('shop_id', context.shopIds)
      .order('name');
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

  async function remove(id: string): Promise<void> {
    const before = await get(id);
    const { error } = await db
      .from('customers')
      .delete()
      .eq('id', id)
      .in('shop_id', context.shopIds);
    if (error) throw error;

    await writeAuditEvent(db, context, {
      action: AUDIT.customerDeleted,
      entityType: 'customer',
      entityId: id,
      before: before ? auditView(before) : null,
    });
  }

  return { list, get, create, update, patch, remove };
}

export type CustomerDomain = ReturnType<typeof createCustomerDomain>;
