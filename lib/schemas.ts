/**
 * lib/schemas.ts
 *
 * Shared zod schemas for validating request bodies at the app/api/** boundary.
 * shopId/userId/jobId are Postgres UUID columns throughout this schema
 * (shops.id, auth.users.id, job_cards.id) — rejecting non-UUID values here
 * is a defense-in-depth input check, not the authorization boundary itself
 * (that's requireShopRole in lib/serverAuth.ts).
 */
import { z } from 'zod';

export const ShopIdSchema = z.string().trim().uuid('Invalid shopId');
export const UserIdSchema = z.string().trim().uuid('Invalid userId');

// job_cards.id is `text primary key`, populated by the app as `JC-${Date.now()}`
// (services/jobCardService.ts createJobCard) — NOT a UUID. An earlier pass of
// this schema incorrectly required UUID format here, which would have
// rejected every real job id with a 400. Confirmed by reading
// supabase-schema.sql (job_cards.id text primary key, no uuid default) and
// the actual insert call. Same non-UUID text-PK pattern applies to
// customers.id (`C-${Date.now()}`), estimates.id, and invoices.number
// (`INV-0001`-style) — see ResourceIdSchema below, used by send-message.
export const JobIdSchema = z
  .string()
  .trim()
  .min(1, 'Invalid jobId')
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid jobId');

// Generic identifier for any of the app's text-PK domain tables
// (job_cards.id, customers.id, estimates.id, invoices.number) — same
// permissive-but-bounded shape as JobIdSchema, since none of these are UUIDs.
export const ResourceIdSchema = z
  .string()
  .trim()
  .min(1, 'Invalid resource id')
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid resource id');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(320);

export const ShopRoleSchema = z.enum(['owner', 'manager', 'advisor', 'technician']);

export const InviteCreateSchema = z.object({
  email: EmailSchema,
  role: ShopRoleSchema.optional().default('manager'),
  shopId: ShopIdSchema,
});

export const InviteRoleChangeSchema = z.object({
  userId: UserIdSchema,
  shopId: ShopIdSchema,
  role: ShopRoleSchema,
});

export const MemberDeleteSchema = z.object({
  userId: UserIdSchema,
  shopId: ShopIdSchema,
});

export const REPAIR_STAGES = [
  'checked_in',
  'inspecting',
  'waiting_parts',
  'in_repair',
  'quality_check',
  'ready',
] as const;
export const RepairStageSchema = z.enum(REPAIR_STAGES);

export const JobStatusTokenRequestSchema = z.object({
  jobId: JobIdSchema,
  shopId: ShopIdSchema,
});

export const JobStatusAdvanceSchema = z.object({
  jobId: JobIdSchema,
  shopId: ShopIdSchema,
  stage: RepairStageSchema,
});

export const JobNotifySchema = z.object({
  jobId: JobIdSchema,
  shopId: ShopIdSchema,
  // Channel toggles only — never a phone number or email address. The
  // actual recipient always comes from the job_cards row itself, never the
  // request body (see CRITICAL 3 in the security review this fixes).
  notifySms: z.boolean().optional().default(true),
  notifyEmail: z.boolean().optional().default(true),
});

export const SendMessageChannelSchema = z.enum(['sms', 'whatsapp', 'line', 'telegram']);

// The recipient is NEVER accepted from the client — see app/api/send-message.
// resourceType + resourceId identify which trusted DB record to resolve the
// phone/email from. `to` is intentionally absent from this schema, and
// SendMessageSchema is `.strict()` (below) so a caller that still sends a
// `to` (or any other unrecognized field) gets an explicit 400, not a silent
// strip — a caller sending a recipient field at all is worth surfacing as a
// hard error, not swallowing quietly.
export const SendMessageResourceTypeSchema = z.enum(['job', 'customer', 'estimate', 'invoice']);

// Display-only content for the message body. Sourced from data the client
// already loaded through its own RLS-protected reads — validated for
// shape/length, not treated as a recipient-resolution trust boundary (that's
// resourceType/resourceId, resolved server-side).
export const SendMessageDocSchema = z.object({
  type: z.string().trim().min(1).max(50),
  number: z.string().trim().min(1).max(100),
  customerName: z.string().trim().max(200).optional(),
  vehicle: z.string().trim().max(200),
  total: z.string().trim().max(50),
  status: z.string().trim().max(100),
  shopName: z.string().trim().max(200),
  shopPhone: z.string().trim().max(50).optional(),
});

export const SendMessageSchema = z
  .object({
    channel: SendMessageChannelSchema,
    shopId: ShopIdSchema,
    resourceType: SendMessageResourceTypeSchema,
    resourceId: ResourceIdSchema,
    doc: SendMessageDocSchema,
  })
  .strict();
