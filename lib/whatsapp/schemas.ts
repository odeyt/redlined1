/**
 * Request bodies for /api/whatsapp/*. All `.strict()`: an unexpected field —
 * above all a phone number or message text — is a 400, never silently used.
 * Recipients and content are always resolved server-side.
 */
import { z } from 'zod';
import { ShopIdSchema } from '@/lib/schemas';

export const ResourceTypeSchema = z.enum(['estimate', 'invoice', 'job']);
export const ResourceIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/, 'Invalid resourceId');
export const LanguageSchema = z.enum(['en', 'lo']);
const MetaIdSchema = z.string().trim().regex(/^\d{5,25}$/, 'Expected a numeric Meta id');

export const ConnectionQuerySchema = z.object({ shopId: ShopIdSchema });

/** The exact phrase the owner types to approve live customer messages. */
export const LIVE_CONFIRMATION_PHRASE = 'SEND LIVE MESSAGES';

export const ConnectionUpdateSchema = z.object({
  shopId: ShopIdSchema,
  enabled: z.boolean().optional(),
  automationsEnabled: z.boolean().optional(),
  automationSettings: z.object({
    jobReadyForPickup: z.boolean().optional(),
    language: LanguageSchema.optional(),
  }).strict().optional(),
  attestations: z.object({
    appVersionOk: z.boolean().optional(),
    onBusinessApp: z.boolean().optional(),
    limitationsAccepted: z.boolean().optional(),
    keepAppActive: z.boolean().optional(),
    paymentMethodAdded: z.boolean().optional(),
  }).strict().optional(),
  businessPhone: z.string().trim().max(30).optional(),
  sandboxRecipients: z.array(z.string().trim().max(30)).max(5).optional(),
  mode: z.enum(['sandbox', 'live']).optional(),
  liveConfirmation: z.string().max(40).optional(),
}).strict();

export const SandboxConnectSchema = z.object({
  shopId: ShopIdSchema,
  phoneNumberId: MetaIdSchema,
  wabaId: MetaIdSchema,
  accessToken: z.string().trim().min(20).max(1000),
  tokenKind: z.enum(['sandbox_temporary', 'system_user']),
}).strict();

export const EmbeddedSignupSchema = z.object({
  shopId: ShopIdSchema,
  code: z.string().trim().min(10).max(2000),
  event: z.string().trim().max(60),
  wabaId: MetaIdSchema,
  phoneNumberId: MetaIdSchema,
  businessId: MetaIdSchema.optional(),
}).strict();

export const TemplatesActionSchema = z.object({
  shopId: ShopIdSchema,
  action: z.enum(['sync', 'submit']),
  languages: z.array(LanguageSchema).min(1).max(2).optional(),
}).strict();

export const SendSchema = z.object({
  shopId: ShopIdSchema,
  resourceType: ResourceTypeSchema,
  resourceId: ResourceIdSchema,
  language: LanguageSchema,
  clientRequestId: z.string().uuid(),
  confirmResend: z.boolean().optional(),
  recordConsent: z.object({
    source: z.enum(['staff_verbal', 'staff_written']),
    note: z.string().trim().max(500).optional(),
  }).strict().optional(),
}).strict();

export const MessagesQuerySchema = z.object({
  shopId: ShopIdSchema,
  resourceType: ResourceTypeSchema,
  resourceId: ResourceIdSchema,
  language: LanguageSchema.default('en'),
});

export const ConsentSchema = z.object({
  shopId: ShopIdSchema,
  resourceType: ResourceTypeSchema,
  resourceId: ResourceIdSchema,
  status: z.enum(['opted_in', 'opted_out']),
  source: z.enum(['staff_verbal', 'staff_written', 'customer_form', 'staff_opt_out']),
  note: z.string().trim().max(500).optional(),
}).strict();

export const AutomationSchema = z.object({
  shopId: ShopIdSchema,
  event: z.literal('job_stage_changed'),
  jobId: ResourceIdSchema,
}).strict();
