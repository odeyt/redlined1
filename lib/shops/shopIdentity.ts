/**
 * Whether a shop can put its name on a document a customer will see.
 *
 * ## What this exists to stop
 *
 * KARS entered 29 customers, 9 vehicles, one job card and one invoice, then
 * stopped. It has no `shop_settings` row at all, and the three output paths
 * each invented a different answer for the missing name:
 *
 *     fetchShopSettings()        -> "My Shop"     (services/shopSettingsService)
 *     invoice print / preview    -> "Redlined1"   (features/invoices/InvoicesView)
 *     send-document email        -> PGRST116, the request simply fails
 *
 * So the invoice did not come out blank. It came out carrying OUR product name
 * on a document going to their customer, and emailing it errored. Reproduced
 * against production before any of this was written.
 *
 * ## One rule, server-authoritative
 *
 * Every customer-facing path asks this and nothing re-implements it. The
 * fallbacks above are exactly what happens when each surface decides for
 * itself, and three surfaces produced three different wrong answers.
 *
 * ## What counts as ready
 *
 * A business name, an address, and a telephone number. Nothing else. Logo, tax
 * id, website and email are deliberately NOT required — no current product rule
 * requires them, and a readiness check that demands more than the product does
 * would block shops that are genuinely fine.
 *
 * A row that exists but holds blanks is not ready either. Two tenants are in
 * exactly that state (a name, but empty address and phone), so "the row
 * exists" was never the question worth asking.
 */

/** Stable keys. These cross the wire to the client and into error payloads. */
export type ShopIdentityField = 'businessName' | 'address' | 'phone';

export const SHOP_IDENTITY_FIELDS: ReadonlyArray<{
  key: ShopIdentityField;
  /** Shown to the operator. Never a column name. */
  label: string;
}> = [
  { key: 'businessName', label: 'Business name' },
  { key: 'address', label: 'Business address' },
  { key: 'phone', label: 'Telephone number' },
];

export type ShopIdentityReason =
  | 'ready'
  /** No shop_settings row exists for this shop at all. */
  | 'settings_row_missing'
  /** The row exists but one or more required fields are blank. */
  | 'identity_incomplete';

export interface ShopIdentityReadiness {
  ready: boolean;
  missingFields: ShopIdentityField[];
  settingsRowExists: boolean;
  shopId: string;
  reasonCode: ShopIdentityReason;
}

/** The columns this rule reads, and only these. */
export interface ShopIdentityRow {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
}

/**
 * Whitespace is not a value.
 *
 * A phone field holding " " is indistinguishable from an empty one on a
 * printed invoice, and it is what a form produces when someone tabs through it.
 */
function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The readiness of one shop, given its settings row (or its absence).
 *
 * Pure: the caller does the fetching, so the same rule serves an API route, a
 * server action and a test without any of them needing a database.
 *
 * `row === null` means NO ROW — which is a different failure from a row full of
 * blanks, and the two are reported separately because they need different
 * repairs: one needs a row created, the other needs a person to fill it in.
 */
export function evaluateShopIdentity(
  shopId: string,
  row: ShopIdentityRow | null | undefined,
): ShopIdentityReadiness {
  const settingsRowExists = row != null;

  const missingFields: ShopIdentityField[] = [];
  if (!present(row?.company_name)) missingFields.push('businessName');
  if (!present(row?.address)) missingFields.push('address');
  if (!present(row?.phone)) missingFields.push('phone');

  const ready = settingsRowExists && missingFields.length === 0;

  return {
    ready,
    missingFields,
    settingsRowExists,
    shopId,
    reasonCode: ready
      ? 'ready'
      : settingsRowExists ? 'identity_incomplete' : 'settings_row_missing',
  };
}

/** The machine-readable code every blocked document path returns. */
export const SHOP_IDENTITY_INCOMPLETE = 'SHOP_IDENTITY_INCOMPLETE' as const;

/**
 * One sentence naming what is missing, for a person.
 *
 * Never mentions `shop_settings` or any other table: the operator is being
 * asked to finish their profile, not to debug a schema.
 */
export function describeMissing(missing: readonly ShopIdentityField[]): string {
  const labels = SHOP_IDENTITY_FIELDS
    .filter(f => missing.includes(f.key))
    .map(f => f.label.toLowerCase());
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
}
