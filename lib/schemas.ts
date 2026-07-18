/**
 * lib/schemas.ts
 *
 * Shared zod schemas for validating request bodies at the app/api/** boundary.
 * shopId/userId are Postgres UUID columns (shops.id, auth.users.id) —
 * rejecting non-UUID values here is a defense-in-depth input check, not the
 * authorization boundary itself (that's requireShopRole in lib/serverAuth.ts).
 */
import { z } from 'zod';

export const ShopIdSchema = z.string().trim().uuid('Invalid shopId');
export const UserIdSchema = z.string().trim().uuid('Invalid userId');

// job_cards.id is `text primary key`, populated by the app as `JC-${Date.now()}`
// (services/jobCardService.ts createJobCard) — NOT a UUID. This schema
// previously required UUID format here, which rejected every real job id
// with a 400 in production. Confirmed by reading supabase-schema.sql
// (job_cards.id text primary key, no uuid default) and the actual insert
// call. Bounded to a safe charset (alphanumeric, dash, underscore) as
// defense-in-depth against path traversal / injection-shaped input, while
// still accepting the real `JC-<epoch-ms>` id format.
export const JobIdSchema = z
  .string()
  .trim()
  .min(1, 'Invalid jobId')
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid jobId');

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
