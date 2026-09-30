/**
 * Internal reminders — who needs to do what, and by when.
 *
 * A shop's own to-do list, linked to the customer, vehicle or job card it is
 * about. Nothing here contacts a customer: there is no send, no channel and no
 * "sent" state. A reminder records internal work and nothing else.
 *
 * ## Where the rules live
 *
 * In the database. RLS decides who sees and edits a reminder; the
 * shop_reminders_guard trigger enforces links, assignment, the plan and the
 * Free Forever cap, and writes history with the caller taken from auth.uid()
 * (supabase/migrations/2026-09-29_internal_reminders.sql). This layer
 * validates input so a person gets a sentence rather than a Postgres error,
 * keeps writes inside the context's shops, and translates the trigger's
 * refusals. It is a second line, never the only one.
 *
 * ## Retries
 *
 * Creates carry a client-generated id, so a retry after a dropped response
 * collides on the primary key and returns the reminder already made instead of
 * a second one. Status changes are idempotent in the database: completing a
 * completed reminder changes nothing and records nothing.
 */
import type { DomainDeps } from './db';
import {
  ReminderCreateSchema, ReminderUpdateSchema, ReminderIdSchema, ReminderStatusSchema,
  firstIssue,
  type ReminderCreateInput, type ReminderUpdateInput, type ReminderPriority, type ReminderStatus,
} from '@/lib/reminders/schemas';
import {
  parseReminderRefusal, reminderRefusalMessage, isUpgradeRefusal,
  type ReminderRefusal, type ReminderTier,
} from '@/lib/reminders/entitlements';

export type { ReminderPriority, ReminderStatus, ReminderCreateInput, ReminderUpdateInput };

export interface Reminder {
  id: string;
  shopId: string;
  title: string;
  notes: string | null;
  dueAt: string;
  priority: ReminderPriority;
  status: ReminderStatus;
  assignedTo: string | null;
  customerId: string | null;
  vehicleId: string | null;
  jobCardId: string | null;
  createdBy: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReminderEventAction = 'created' | 'updated' | 'assigned' | 'completed' | 'reopened' | 'cancelled';

export interface ReminderEvent {
  id: string;
  reminderId: string;
  action: ReminderEventAction;
  fromStatus: string | null;
  toStatus: string | null;
  changedFields: string[];
  assignedTo: string | null;
  actorId: string | null;
  createdAt: string;
}

export type ReminderLink =
  | { kind: 'customer'; id: string }
  | { kind: 'vehicle'; id: string }
  | { kind: 'job_card'; id: string };

export class ReminderError extends Error {
  /** The database's reason, when it was a plan or permission refusal. */
  readonly refusal: ReminderRefusal | null;
  /** True only when an upgrade would fix it — the one time to offer one. */
  readonly upgrade: boolean;
  constructor(message: string, refusal: ReminderRefusal | null = null) {
    super(message);
    this.name = 'ReminderError';
    this.refusal = refusal;
    this.upgrade = isUpgradeRefusal(refusal);
  }
}

/** Same message for "does not exist" and "not yours", so neither leaks. */
const NOT_FOUND = 'That reminder could not be found. It may have been removed, or you may not have access to it.';

// One literal, not a concatenation: supabase-js parses the select string at
// the type level, and a computed string types every row as an error.
const COLUMNS = 'id, shop_id, title, notes, due_at, priority, status, assigned_to, customer_id, vehicle_id, job_card_id, created_by, completed_by, completed_at, created_at, updated_at';

function mapReminder(row: Record<string, unknown>): Reminder {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    title: (row.title as string) ?? '',
    notes: (row.notes as string) ?? null,
    dueAt: row.due_at as string,
    priority: (row.priority as ReminderPriority) ?? 'normal',
    status: (row.status as ReminderStatus) ?? 'open',
    assignedTo: (row.assigned_to as string) ?? null,
    customerId: (row.customer_id as string) ?? null,
    vehicleId: (row.vehicle_id as string) ?? null,
    jobCardId: (row.job_card_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    completedBy: (row.completed_by as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function mapEvent(row: Record<string, unknown>): ReminderEvent {
  return {
    id: row.id as string,
    reminderId: row.reminder_id as string,
    action: row.action as ReminderEventAction,
    fromStatus: (row.from_status as string) ?? null,
    toStatus: (row.to_status as string) ?? null,
    changedFields: (row.changed_fields as string[]) ?? [],
    assignedTo: (row.assigned_to as string) ?? null,
    actorId: (row.actor_id as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

/** Postgres unique_violation — the retried create whose first attempt landed. */
const UNIQUE_VIOLATION = '23505';

/**
 * Turns a database error into a ReminderError. Refusals from the trigger get
 * their specific sentence; RLS refusals get the generic not-found sentence so
 * they reveal nothing; anything else is passed on unchanged, because hiding a
 * genuine failure behind a friendly message is how outages go unnoticed.
 */
const NO_ACCESS = 'You do not have access to add that reminder in this shop.';

function translate(error: unknown, rlsMessage: string = NOT_FOUND): Error {
  const refusal = parseReminderRefusal(error);
  if (refusal) return new ReminderError(reminderRefusalMessage(refusal), refusal);
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && /row-level security/i.test(message)) return new ReminderError(rlsMessage);
  if (typeof message === 'string' && /shop_reminders_title_length/.test(message)) {
    return new ReminderError('Give the reminder a title of up to 160 characters.');
  }
  if (typeof message === 'string' && /shop_reminders_notes_length/.test(message)) {
    return new ReminderError('Keep notes under 2000 characters.');
  }
  return error instanceof Error ? error : new Error(typeof message === 'string' ? message : 'Reminder request failed');
}

export interface ReminderListOptions {
  /** 'open' for the working list, 'closed' for completed and cancelled history. */
  state?: 'open' | 'closed';
  /** Only reminders linked to this record. */
  link?: ReminderLink;
  /** Only reminders assigned to this user. */
  assignedTo?: string;
  /** Bound the closed history; open reminders are never truncated. */
  limit?: number;
}

const LINK_COLUMN = { customer: 'customer_id', vehicle: 'vehicle_id', job_card: 'job_card_id' } as const;

export function createReminderDomain({ db, context }: DomainDeps) {
  async function list(options: ReminderListOptions = {}): Promise<Reminder[]> {
    let query = db.from('shop_reminders').select(COLUMNS).in('shop_id', context.shopIds);
    if (options.state === 'open') query = query.eq('status', 'open');
    if (options.state === 'closed') query = query.in('status', ['completed', 'cancelled']);
    if (options.link) query = query.eq(LINK_COLUMN[options.link.kind], options.link.id);
    if (options.assignedTo) query = query.eq('assigned_to', options.assignedTo);
    query = options.state === 'closed'
      ? query.order('updated_at', { ascending: false })
      : query.order('due_at', { ascending: true });
    if (options.limit && options.state === 'closed') query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw translate(error);
    return (data ?? []).map(row => mapReminder(row as Record<string, unknown>));
  }

  async function get(id: string): Promise<Reminder | null> {
    const parsed = ReminderIdSchema.safeParse(id);
    if (!parsed.success) return null;
    const { data, error } = await db
      .from('shop_reminders').select(COLUMNS)
      .eq('id', parsed.data).in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw translate(error);
    return data ? mapReminder(data as Record<string, unknown>) : null;
  }

  async function create(input: ReminderCreateInput): Promise<Reminder> {
    const parsed = ReminderCreateSchema.safeParse(input);
    if (!parsed.success) throw new ReminderError(firstIssue(parsed.error));
    const v = parsed.data;

    // Always the active shop — context.shopId, the single write target the
    // domain context exists to make explicit. Never the linked record's shop:
    // a customer shown from a mirrored location belongs to that location, and
    // the database refuses the link rather than this quietly filing the
    // reminder somewhere the person did not choose. Reads may span mirrors;
    // writes never do.
    const row: Record<string, unknown> = {
      shop_id: context.shopId,
      title: v.title,
      notes: v.notes,
      due_at: new Date(v.dueAt).toISOString(),
      priority: v.priority,
      status: 'open',
      assigned_to: v.assignedTo,
      customer_id: v.customerId,
      vehicle_id: v.vehicleId,
      job_card_id: v.jobCardId,
      // The database overwrites this with auth.uid(); sent so the RLS check
      // reads the same value the trigger will stamp.
      created_by: context.actor.userId,
    };
    if (v.id) row.id = v.id;

    const { data, error } = await db.from('shop_reminders').insert(row).select(COLUMNS).single();
    if (error) {
      if (v.id && (error as { code?: string }).code === UNIQUE_VIOLATION) {
        const existing = await get(v.id);
        if (existing) return existing;
      }
      throw translate(error, NO_ACCESS);
    }
    return mapReminder(data as Record<string, unknown>);
  }

  async function update(id: string, patch: ReminderUpdateInput): Promise<Reminder> {
    const idCheck = ReminderIdSchema.safeParse(id);
    if (!idCheck.success) throw new ReminderError(NOT_FOUND);
    const parsed = ReminderUpdateSchema.safeParse(patch);
    if (!parsed.success) throw new ReminderError(firstIssue(parsed.error));
    const v = parsed.data;

    const row: Record<string, unknown> = {};
    if (v.title !== undefined) row.title = v.title;
    if (v.notes !== undefined) row.notes = v.notes;
    if (v.dueAt !== undefined) row.due_at = new Date(v.dueAt).toISOString();
    if (v.priority !== undefined) row.priority = v.priority;
    if (v.assignedTo !== undefined) row.assigned_to = v.assignedTo;
    if (v.customerId !== undefined) row.customer_id = v.customerId;
    if (v.vehicleId !== undefined) row.vehicle_id = v.vehicleId;
    if (v.jobCardId !== undefined) row.job_card_id = v.jobCardId;
    if (Object.keys(row).length === 0) {
      const current = await get(idCheck.data);
      if (!current) throw new ReminderError(NOT_FOUND);
      return current;
    }
    return write(idCheck.data, row);
  }

  async function setStatus(id: string, status: ReminderStatus): Promise<Reminder> {
    const idCheck = ReminderIdSchema.safeParse(id);
    if (!idCheck.success) throw new ReminderError(NOT_FOUND);
    const statusCheck = ReminderStatusSchema.safeParse(status);
    if (!statusCheck.success) throw new ReminderError('That is not a reminder status.');
    // Completion time and completer are stamped by the database; sending them
    // would be ignored, so they are not sent.
    return write(idCheck.data, { status: statusCheck.data });
  }

  async function write(id: string, row: Record<string, unknown>): Promise<Reminder> {
    const { data, error } = await db
      .from('shop_reminders').update(row)
      .eq('id', id).in('shop_id', context.shopIds)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw translate(error);
    if (!data) throw new ReminderError(NOT_FOUND);
    return mapReminder(data as Record<string, unknown>);
  }

  async function history(id: string): Promise<ReminderEvent[]> {
    const parsed = ReminderIdSchema.safeParse(id);
    if (!parsed.success) return [];
    const { data, error } = await db
      .from('shop_reminder_events')
      .select('id, reminder_id, action, from_status, to_status, changed_fields, assigned_to, actor_id, created_at')
      .eq('reminder_id', parsed.data)
      .order('created_at', { ascending: true });
    if (error) throw translate(error);
    return (data ?? []).map(row => mapEvent(row as Record<string, unknown>));
  }

  /**
   * Display names for the records reminders link to, read within this
   * context's shops (RLS applies as well). Vehicles are described by
   * year/make/model or label and plate — never by VIN.
   */
  async function linkLabels(reminders: readonly Reminder[]): Promise<Record<string, string>> {
    const ids = (pick: (r: Reminder) => string | null) =>
      [...new Set(reminders.map(pick).filter((v): v is string => !!v))];
    const customerIds = ids(r => r.customerId);
    const vehicleIds = ids(r => r.vehicleId);
    const labels: Record<string, string> = {};
    for (const r of reminders) if (r.jobCardId) labels['job_card:' + r.jobCardId] = r.jobCardId;

    // Labels are a convenience; a failed lookup leaves the id, never the list.
    if (customerIds.length > 0) {
      const { data } = await db.from('customers').select('id, name')
        .in('id', customerIds).in('shop_id', context.shopIds);
      for (const c of (data ?? []) as { id: string; name: string | null }[]) {
        labels['customer:' + c.id] = c.name || 'Customer';
      }
    }
    if (vehicleIds.length > 0) {
      const { data } = await db.from('vehicles').select('id, label, year, make, model, plate')
        .in('id', vehicleIds).in('shop_id', context.shopIds);
      for (const v of (data ?? []) as Record<string, unknown>[]) {
        const ymm = [v.year, v.make, v.model].filter(Boolean).join(' ');
        const name = ymm || (v.label as string) || 'Vehicle';
        labels['vehicle:' + (v.id as string)] = v.plate ? `${name} · ${v.plate as string}` : name;
      }
    }
    return labels;
  }

  /** The shop's reminder entitlement, from the same function the trigger uses. */
  async function tier(shopId: string = context.shopId): Promise<ReminderTier | null> {
    const { data, error } = await db.rpc('reminder_plan_tier', { p_shop_id: shopId });
    if (error) return null;
    return (data as ReminderTier | null) ?? null;
  }

  return {
    list, get, create, update, history, tier, linkLabels,
    complete: (id: string) => setStatus(id, 'completed'),
    reopen: (id: string) => setStatus(id, 'open'),
    cancel: (id: string) => setStatus(id, 'cancelled'),
  };
}

export type ReminderDomain = ReturnType<typeof createReminderDomain>;
