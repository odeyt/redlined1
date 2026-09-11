/**
 * What a shop that has configured nothing is treated as having configured.
 *
 * The fallbacks behind the three pricing fields, in one dependency-free module
 * so that browser services, React views and server routes can all name the
 * same values. They were previously eight separate `?? 145` literals spread
 * across services, views and API routes, which is how two screens quietly come
 * to disagree about what an hour costs.
 *
 * Note what is deliberately NOT here: labour hours and parts totals for a new
 * job. Those are measurements of work nobody has done yet, not settings, so
 * there is nothing for a shop to configure and no default to fall back to.
 * They start at zero. See createJobCard.
 */
export const SHOP_PRICING_DEFAULTS: {
  /** Hourly labour rate, in the shop's currency. */
  laborRate: number;
  /**
   * Fraction, not a percentage — 0.08 would be 8%.
   *
   * Zero, and it has to be zero. A labour rate can carry a working guess
   * because a person reads it in a form before it reaches a customer; a tax
   * rate multiplies the invoice total on its way out. This used to be 0.08,
   * which meant every shop provisioned since the settings row stopped
   * carrying a seeded value — the trigger writes only shop_id, company_name,
   * address and phone, so default_tax_rate is NULL — silently charged 8% US
   * sales tax. RedlineD1 runs in Laos. There is no rate that is right for an
   * unknown jurisdiction, so the only honest starting point is none, which is
   * already what the estimate and invoice forms open at.
   */
  taxRate: number;
  currency: string;
} = {
  laborRate: 145,
  taxRate: 0,
  currency: 'USD',
};
