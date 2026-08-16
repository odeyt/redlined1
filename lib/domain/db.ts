/**
 * The database handle a domain service is given.
 *
 * A type, never an instance. Nothing under lib/domain/ may import a Supabase
 * client — not the browser singleton in `lib/supabase.ts`, not the
 * service-role client in `lib/supabase-server.ts`. The caller decides which
 * one it is:
 *
 *   browser session  → the anon client, RLS scoped to the signed-in user
 *   route handler    → a request-scoped client carrying the caller's JWT
 *   webhook / job    → the service-role client, used deliberately and rarely
 *
 * That choice belongs to the caller because only the caller knows what
 * privileges its situation deserves. Baking one in here is how a service-role
 * key ends up reachable from a component.
 *
 * `lib/domain/__tests__/noBrowserState.test.ts` enforces this.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DomainDb = SupabaseClient<any, any, any>;

import type { DomainContext } from './context';

/** What every domain factory receives. */
export interface DomainDeps {
  db: DomainDb;
  context: DomainContext;
}
