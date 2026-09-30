/**
 * Input validation for internal reminders.
 *
 * The database constraints and the shop_reminders_guard trigger are the
 * enforcement; these schemas are the same limits applied before a request is
 * made, so a person gets a sentence next to the field instead of a Postgres
 * error. Limits here must match the CHECK constraints in
 * supabase/migrations/2026-09-29_internal_reminders.sql (a test compares them).
 */
import { z } from 'zod';
import { JobIdSchema } from '@/lib/schemas';

export const REMINDER_TITLE_MAX = 160;
export const REMINDER_NOTES_MAX = 2000;

export const REMINDER_PRIORITIES = ['low', 'normal', 'high'] as const;
export const REMINDER_STATUSES = ['open', 'completed', 'cancelled'] as const;

export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

const Uuid = z.string().trim().uuid('Not a valid id');

// customers.id is TEXT and has held more than one format over the product's
// life, so it is bounded by charset and length rather than a single pattern —
// the same defence JobIdSchema uses for job_cards.id.
const CustomerId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/, 'Not a valid customer id');

/**
 * An ISO-8601 instant with an explicit offset or Z — never a bare local time,
 * whose meaning would depend on whoever parsed it.
 *
 * The calendar date is checked separately because Date.parse rolls impossible
 * dates over instead of refusing them: '2026-02-30' becomes 2 March.
 */
function isRealInstant(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m || Number.isNaN(Date.parse(v))) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

const DueAt = z
  .string()
  .trim()
  .refine(isRealInstant, 'Choose a valid due date and time');

const Title = z
  .string()
  .trim()
  .min(1, 'Give the reminder a title')
  .max(REMINDER_TITLE_MAX, `Keep the title under ${REMINDER_TITLE_MAX} characters`);

const Notes = z
  .string()
  .max(REMINDER_NOTES_MAX, `Keep notes under ${REMINDER_NOTES_MAX} characters`)
  .transform(v => (v.trim() === '' ? null : v))
  .nullable();

export const ReminderCreateSchema = z.object({
  /** Client-generated, so a retried create cannot make a second reminder. */
  id: Uuid.optional(),
  // Deliberately no shopId: a reminder is always created in the caller's
  // active shop (the domain context), never one named by the request.
  title: Title,
  notes: Notes.optional().default(null),
  dueAt: DueAt,
  priority: z.enum(REMINDER_PRIORITIES).default('normal'),
  assignedTo: Uuid.nullable().optional().default(null),
  customerId: CustomerId.nullable().optional().default(null),
  vehicleId: Uuid.nullable().optional().default(null),
  jobCardId: JobIdSchema.nullable().optional().default(null),
}).strict();

export const ReminderUpdateSchema = z.object({
  title: Title.optional(),
  notes: Notes.optional(),
  dueAt: DueAt.optional(),
  priority: z.enum(REMINDER_PRIORITIES).optional(),
  assignedTo: Uuid.nullable().optional(),
  customerId: CustomerId.nullable().optional(),
  vehicleId: Uuid.nullable().optional(),
  jobCardId: JobIdSchema.nullable().optional(),
}).strict();

export const ReminderIdSchema = Uuid;
export const ReminderStatusSchema = z.enum(REMINDER_STATUSES);

export type ReminderCreateInput = z.input<typeof ReminderCreateSchema>;
export type ReminderUpdateInput = z.input<typeof ReminderUpdateSchema>;

/** First human-readable problem in a failed parse. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the reminder details and try again.';
}
