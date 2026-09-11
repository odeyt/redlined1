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
  /** Fraction, not a percentage — 0.08 is 8%. */
  taxRate: number;
  currency: string;
} = {
  laborRate: 145,
  taxRate: 0.08,
  currency: 'USD',
};
