/**
 * Whether the demo seed may write into a shop. Pure: facts in, reasons out.
 *
 * The seed collects the facts with read-only queries and refuses to write
 * unless this returns no failures. Every fact can be `null` ("could not be
 * determined") and every gate treats null as a failure, so a failed query, a
 * missing column or an unset variable stops the run instead of letting it
 * proceed on an assumption.
 *
 * A shop is a demo shop only if BOTH are true:
 *   1. the operator named it explicitly (DEMO_SHOP_ID), and
 *   2. the database says so: shops.is_synthetic = true, read back live.
 * Neither is enough alone. The seed never picks a shop by name.
 */

/**
 * D1 Imports' own shops. Verbatim from CLAUDE.md and lib/usePlan.ts's
 * INTERNAL_SHOP_IDS (not importable here: that module is a client hook).
 */
export const INTERNAL_SHOP_IDS: readonly string[] = [
  '38d55fae-741b-4bac-b520-f96eed65bf38',
  '90b72748-bf01-4456-999f-f4ba48091606',
];

export const PRODUCTION_PROJECT_REF = 'ldjrlvjkmzrcdqhetqoh';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SeedMode = 'plan' | 'apply' | 'cleanup';

export interface DemoTargetFacts {
  mode: SeedMode;
  env: {
    /** DEMO_SHOP_ID. */
    shopId: string | undefined;
    /** ALLOW_DEMO_SEED — required for any write. */
    allowWrite: string | undefined;
    /** ALLOW_PRODUCTION_DEMO_SEED — additionally required for a write to production. */
    allowProduction: string | undefined;
    /** Supabase project ref the client is pointed at. */
    projectRef: string;
  };
  /** The shop, read back from the database. null if it could not be read. */
  shop: { id: string; name: string; isSynthetic: boolean | null } | null;
  /** Rows in shop_mirrors naming this shop on either side. null if unreadable. */
  mirrorLinks: number | null;
  /** Every member of the shop. null if unreadable. */
  members: { userId: string; role: string }[] | null;
  /** The owner's profiles.plan. undefined when it could not be read. */
  ownerPlan: string | null | undefined;
  /** Whether "today" in Chicago and in UTC overlap long enough right now. */
  todayWindowUsable: boolean;
}

export function demoTargetFailures(f: DemoTargetFacts): string[] {
  const failures: string[] = [];
  const writes = f.mode !== 'plan';

  const id = f.env.shopId?.trim();
  if (!id) failures.push('DEMO_SHOP_ID is not set: name the demo shop explicitly; the seed never selects a shop by name');
  else if (!UUID.test(id)) failures.push('DEMO_SHOP_ID is not a UUID');

  if (id && INTERNAL_SHOP_IDS.includes(id.toLowerCase())) {
    failures.push('DEMO_SHOP_ID is a D1 Imports internal shop — never a demo target');
  }

  if (writes && f.env.allowWrite !== 'true') failures.push('ALLOW_DEMO_SEED is not exactly "true"');
  if (writes && f.env.projectRef === PRODUCTION_PROJECT_REF && f.env.allowProduction !== 'true') {
    failures.push('target is PRODUCTION and ALLOW_PRODUCTION_DEMO_SEED is not exactly "true"');
  }
  if (!f.env.projectRef) failures.push('the target Supabase project could not be determined (NEXT_PUBLIC_SUPABASE_URL)');

  if (!f.shop) {
    failures.push('the shop could not be read back from the database');
  } else {
    if (id && f.shop.id.toLowerCase() !== id.toLowerCase()) failures.push('the shop read back is not the one named by DEMO_SHOP_ID');
    if (f.shop.isSynthetic === null) {
      failures.push('shops.is_synthetic does not exist — apply 2026-09-15_shops_is_synthetic.sql (feat/marketing-capture-harness) first');
    } else if (!f.shop.isSynthetic) {
      failures.push(`shop "${f.shop.name}" is not marked is_synthetic = true — refusing to treat it as a demo shop`);
    }
  }

  // Mirrored shops read each other's rows (getShopIds). Seeding a mirrored
  // shop would put fictional customers on a real shop's screens.
  if (f.mirrorLinks === null) failures.push('shop_mirrors could not be read');
  else if (f.mirrorLinks > 0) failures.push(`the shop is linked in shop_mirrors (${f.mirrorLinks} row(s)); its data would appear in another shop`);

  if (f.members === null) {
    failures.push('shop members could not be read');
  } else {
    const owners = f.members.filter(m => m.role === 'owner');
    if (owners.length !== 1) failures.push(`the demo shop must have exactly one owner (found ${owners.length})`);
    if (f.members.length !== owners.length) {
      failures.push(`the demo shop has ${f.members.length - owners.length} non-owner member(s); a demo shop has only its owner`);
    }
  }

  // Free Forever cannot hold this dataset: enforce_free_tier_count_limit caps
  // customers and vehicles at 10 and job cards at 5 a month (for every role,
  // service_role included), and Payments / Parts / Reports are paid modules,
  // so the detail screens behind the dashboard would be locked. Changing the
  // owner's plan is an owner decision — the seed reports it and stops.
  //
  // The trigger tests plan = 'free' and nothing else, so a trial date does not
  // help: signup writes plan 'free' WITH a trial date, and that row is capped.
  if (writes && f.ownerPlan === 'free') {
    failures.push('the demo owner\'s profiles.plan is \'free\': enforce_free_tier_count_limit (10 customers, 10 vehicles, 5 job cards/month) would reject the seed part-way, and Payments/Parts/Reports would be locked. See docs/demo-seed.md, "Owner plan".');
  }
  if (writes && f.ownerPlan === undefined) failures.push('the demo owner\'s profile could not be read');

  if (writes && f.mode === 'apply' && !f.todayWindowUsable) {
    failures.push('it is evening in Chicago and already tomorrow in UTC: "today" records would disagree between the server and the browser. Run between 01:00 and 18:00 America/Chicago.');
  }

  return failures;
}
