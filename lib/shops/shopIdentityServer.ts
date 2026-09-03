import 'server-only';

/**
 * The server-authoritative shop identity check.
 *
 * Every customer-facing document path calls THIS, not its own query. The
 * browser's copy of the answer is a convenience for hiding a button; this is
 * what decides whether a document is produced, so a request made with curl is
 * refused exactly like one made by clicking.
 *
 * Uses `maybeSingle()` deliberately. `send-document` used `.single()`, which
 * raises PGRST116 when no row exists — so a shop with no settings did not get a
 * clear refusal, it got a database error with a message nobody could act on.
 * A missing row is an expected state here, not an exception.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import {
  evaluateShopIdentity,
  type ShopIdentityReadiness,
  type ShopIdentityRow,
} from './shopIdentity';

export async function loadShopIdentity(shopId: string): Promise<ShopIdentityReadiness> {
  if (!shopId) {
    return {
      ready: false,
      missingFields: ['businessName', 'address', 'phone'],
      settingsRowExists: false,
      shopId: '',
      reasonCode: 'settings_row_missing',
    };
  }

  const { data, error } = await getAdminDb()
    .from('shop_settings')
    .select('company_name, address, phone')
    .eq('shop_id', shopId)
    .maybeSingle();

  /**
   * A failed read is NOT treated as "ready".
   *
   * The whole point is to stop an unusable document reaching a customer, and a
   * check that fails open would do nothing on exactly the day the database is
   * unhappy. It reports as though the row were missing, which is the safe
   * direction: the operator is asked to complete a profile they may have
   * already completed, rather than sending an invoice headed "Redlined1".
   */
  if (error) {
    return evaluateShopIdentity(shopId, null);
  }

  return evaluateShopIdentity(shopId, (data ?? null) as ShopIdentityRow | null);
}
