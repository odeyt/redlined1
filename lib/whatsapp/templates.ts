/**
 * Message templates RedlineD1 sends through the Cloud API.
 *
 * WhatsApp only lets a business START a conversation with a template Meta has
 * reviewed and approved. Estimates, invoices and repair updates are business-
 * initiated, so every message here is a template — RedlineD1 never sends free
 * text to a customer. Category UTILITY: transactional updates about something
 * the customer asked for, not marketing.
 *
 * The definitions live in code so the text staff see in the preview is the
 * exact text Meta reviewed. Approval STATUS lives in the database
 * (whatsapp_templates), synced from Meta; a template that is not APPROVED for
 * the chosen language is never sent.
 *
 * Secure links: estimate and invoice templates carry a URL button whose
 * dynamic suffix is the customer's portal token (lib/portal/portalToken.ts).
 * The token is never in the body text, and the base URL is fixed when the
 * template is submitted, so a message can only ever link to this site's
 * portal.
 *
 * Meta's rules this file follows: lowercase snake_case names; a body may not
 * start or end with a variable; variables are numbered {{1}}.. in order;
 * parameter values may not contain newlines, tabs or more than four
 * consecutive spaces; each submission needs example values.
 *
 * LAO TEXT IS A DRAFT. It must be reviewed by a native speaker at D1 Imports
 * before the Lao templates are submitted to Meta (see
 * docs/whatsapp/META_ONBOARDING.md). The English templates do not depend on it.
 */
import { siteOrigin } from './config';

export type TemplateKind = 'estimate_ready' | 'invoice_ready' | 'repair_update';
export type TemplateLanguage = 'en' | 'lo';
export const TEMPLATE_LANGUAGES: readonly TemplateLanguage[] = ['en', 'lo'];

export interface TemplateDefinition {
  kind: TemplateKind;
  name: string;
  category: 'UTILITY';
  /** Ordered body parameter meanings, for the preview and for docs. */
  params: readonly string[];
  body: Record<TemplateLanguage, string>;
  /** Example values Meta requires at submission, per language. */
  examples: Record<TemplateLanguage, readonly string[]>;
  footer?: Record<TemplateLanguage, string>;
  button?: { text: Record<TemplateLanguage, string>; path: '/portal/' };
}

export const TEMPLATES: Record<TemplateKind, TemplateDefinition> = {
  estimate_ready: {
    kind: 'estimate_ready',
    name: 'redline_estimate_ready',
    category: 'UTILITY',
    params: ['customer name', 'estimate number', 'shop name', 'vehicle', 'estimated total'],
    body: {
      en: 'Hello {{1}}, your estimate {{2}} from {{3}} for {{4}} is ready. Estimated total: {{5}}. Tap the button below to review it securely.',
      lo: 'ສະບາຍດີ {{1}}, ໃບສະເໜີລາຄາ {{2}} ຈາກ {{3}} ສຳລັບ {{4}} ພ້ອມແລ້ວ. ລາຄາລວມໂດຍປະມານ: {{5}}. ກົດປຸ່ມລຸ່ມນີ້ເພື່ອເບິ່ງຢ່າງປອດໄພ.',
    },
    examples: {
      en: ['Somchai', 'EST-0041', 'D1 Imports', '2019 Toyota Hilux', 'USD 106.35'],
      lo: ['ສົມໃຈ', 'EST-0041', 'D1 Imports', '2019 Toyota Hilux', 'USD 106.35'],
    },
    footer: { en: 'Reply STOP to opt out', lo: 'ຕອບ STOP ເພື່ອຍົກເລີກ' },
    button: { text: { en: 'View estimate', lo: 'ເບິ່ງໃບສະເໜີລາຄາ' }, path: '/portal/' },
  },
  invoice_ready: {
    kind: 'invoice_ready',
    name: 'redline_invoice_ready',
    category: 'UTILITY',
    params: ['customer name', 'invoice number', 'shop name', 'vehicle', 'amount'],
    body: {
      en: 'Hello {{1}}, invoice {{2}} from {{3}} for {{4}} is ready. Amount: {{5}}. Tap the button below to view it securely.',
      lo: 'ສະບາຍດີ {{1}}, ໃບແຈ້ງໜີ້ {{2}} ຈາກ {{3}} ສຳລັບ {{4}} ພ້ອມແລ້ວ. ຈຳນວນເງິນ: {{5}}. ກົດປຸ່ມລຸ່ມນີ້ເພື່ອເບິ່ງຢ່າງປອດໄພ.',
    },
    examples: {
      en: ['Somchai', 'INV-0201', 'D1 Imports', '2019 Toyota Hilux', 'USD 106.35'],
      lo: ['ສົມໃຈ', 'INV-0201', 'D1 Imports', '2019 Toyota Hilux', 'USD 106.35'],
    },
    footer: { en: 'Reply STOP to opt out', lo: 'ຕອບ STOP ເພື່ອຍົກເລີກ' },
    button: { text: { en: 'View invoice', lo: 'ເບິ່ງໃບແຈ້ງໜີ້' }, path: '/portal/' },
  },
  repair_update: {
    kind: 'repair_update',
    name: 'redline_repair_update',
    category: 'UTILITY',
    params: ['customer name', 'vehicle', 'shop name', 'repair status'],
    body: {
      en: 'Hello {{1}}, an update on your {{2}} from {{3}}: {{4}}. Reply to this message if you have any questions.',
      lo: 'ສະບາຍດີ {{1}}, ອັບເດດກ່ຽວກັບ {{2}} ຂອງທ່ານຈາກ {{3}}: {{4}}. ຕອບກັບຂໍ້ຄວາມນີ້ຖ້າທ່ານມີຄຳຖາມ.',
    },
    examples: {
      en: ['Somchai', '2019 Toyota Hilux', 'D1 Imports', 'Your vehicle is ready for pickup'],
      lo: ['ສົມໃຈ', '2019 Toyota Hilux', 'D1 Imports', 'ລົດຂອງທ່ານພ້ອມໃຫ້ມາຮັບແລ້ວ'],
    },
    footer: { en: 'Reply STOP to opt out', lo: 'ຕອບ STOP ເພື່ອຍົກເລີກ' },
  },
};

export const TEMPLATE_NAMES = Object.values(TEMPLATES).map(t => t.name);

/** Repair stage → the {{4}} text of the repair update template. */
export const REPAIR_STAGE_TEXT: Record<string, Record<TemplateLanguage, string>> = {
  checked_in: { en: 'Your vehicle has been checked in and is in our queue', lo: 'ລົດຂອງທ່ານໄດ້ລົງທະບຽນຮັບແລ້ວ ແລະ ຢູ່ໃນຄິວ' },
  inspecting: { en: 'Our technician is inspecting your vehicle', lo: 'ຊ່າງຂອງພວກເຮົາກຳລັງກວດລົດຂອງທ່ານ' },
  waiting_parts: { en: 'Parts have been ordered and are on their way', lo: 'ສັ່ງອາໄຫຼ່ແລ້ວ ແລະ ກຳລັງມາ' },
  in_repair: { en: 'Your vehicle is being repaired', lo: 'ລົດຂອງທ່ານກຳລັງສ້ອມແປງ' },
  quality_check: { en: 'Repairs are done and we are doing a final quality check', lo: 'ສ້ອມແປງແລ້ວ ກຳລັງກວດຄຸນນະພາບຄັ້ງສຸດທ້າຍ' },
  ready: { en: 'Your vehicle is ready for pickup', lo: 'ລົດຂອງທ່ານພ້ອມໃຫ້ມາຮັບແລ້ວ' },
};

/**
 * A parameter value Meta will accept: no newlines/tabs, no runs of 5+ spaces,
 * trimmed, bounded. Empty becomes "-" — an empty parameter is rejected by Meta.
 */
export function cleanParam(value: unknown, max = 120): string {
  const s = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (!s) return '-';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Fills {{n}} placeholders for the staff-facing preview. */
export function renderPreview(kind: TemplateKind, lang: TemplateLanguage, params: readonly string[]): string {
  const def = TEMPLATES[kind];
  const body = def.body[lang].replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`);
  return def.footer ? `${body}\n\n${def.footer[lang]}` : body;
}

/** The `template` object of a Cloud API send request. */
export function buildTemplateMessage(
  kind: TemplateKind,
  lang: TemplateLanguage,
  params: readonly string[],
  buttonSuffix?: string,
) {
  const def = TEMPLATES[kind];
  const expected = def.params.length;
  if (params.length !== expected) throw new Error(`template ${def.name} takes ${expected} parameters, got ${params.length}`);
  if (def.button && !buttonSuffix) throw new Error(`template ${def.name} needs a link suffix`);
  if (!def.button && buttonSuffix) throw new Error(`template ${def.name} has no link button`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = [
    { type: 'body', parameters: params.map(p => ({ type: 'text', text: cleanParam(p) })) },
  ];
  if (def.button && buttonSuffix) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonSuffix }] });
  }
  return { name: def.name, language: { code: lang }, components };
}

/** The body of a POST /{WABA_ID}/message_templates submission for one language. */
export function buildTemplateSubmission(kind: TemplateKind, lang: TemplateLanguage) {
  const def = TEMPLATES[kind];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = [
    { type: 'BODY', text: def.body[lang], example: { body_text: [def.examples[lang]] } },
  ];
  if (def.footer) components.push({ type: 'FOOTER', text: def.footer[lang] });
  if (def.button) {
    const base = `${siteOrigin()}${def.button.path}`;
    components.push({
      type: 'BUTTONS',
      buttons: [{
        type: 'URL',
        text: def.button.text[lang],
        url: `${base}{{1}}`,
        example: [`${base}${'0'.repeat(64)}`],
      }],
    });
  }
  return { name: def.name, language: lang, category: def.category, components };
}

export function isTemplateLanguage(v: unknown): v is TemplateLanguage {
  return v === 'en' || v === 'lo';
}
