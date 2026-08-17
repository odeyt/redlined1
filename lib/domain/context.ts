/**
 * Who is asking, on behalf of which tenant.
 *
 * Every domain operation takes one of these explicitly. That is the whole
 * point of the layer: today the same information is read from
 * `lib/shopStore.ts`, a module-level mutable set during sign-in, which means a
 * business rule can only run inside a signed-in browser tab. A route handler,
 * a webhook, a scheduled job, an MCP tool and an AI tool have no such tab, so
 * each of them would have to reimplement the rule — which is exactly how a
 * system ends up with two invoice totals that disagree.
 *
 * Passing the context as an argument makes the same code callable from all of
 * them, and makes tenancy visible at every call site rather than ambient.
 *
 * This is NOT a security boundary on its own. RLS remains authoritative. The
 * context narrows what a query asks for; the database decides what it is
 * allowed to have. Both, not either.
 */

/**
 * Where the request came from. Recorded on every audit row, because "who
 * changed this payment" has a different answer for a service advisor, a
 * webhook retry and an AI agent, and after the fact that distinction is the
 * only thing that explains the change.
 */
import { CAPABILITIES } from '@/lib/auth/capabilities';

/** Every enforced capability. Only for contexts with no human behind them. */
const SYSTEM_CAPABILITIES: readonly string[] =
  CAPABILITIES.filter(c => c.status === 'enforced').map(c => c.id);

export type ActorType = 'user' | 'system' | 'api' | 'mcp' | 'ai' | 'webhook';

export const ACTOR_TYPES: readonly ActorType[] = ['user', 'system', 'api', 'mcp', 'ai', 'webhook'];

export interface DomainActor {
  type: ActorType;
  /** auth.users id where one exists. Null for system and unattended callers. */
  userId: string | null;
  /** shop_users.role at the time of the call, for audit rather than for access. */
  role: string | null;
}

export interface DomainContext {
  /**
   * Nullable through M1. The organizations tier is introduced by this
   * milestone but nothing depends on it yet, and shops created before the
   * back-fill must not be unreachable because a column is empty.
   */
  organizationId: string | null;
  /** The shop a write lands in. Exactly one — a write has one owner. */
  shopId: string;
  /**
   * The shops a read may span: the current shop plus any mirrors. Reads are
   * deliberately wider than writes, so a two-location owner sees both without
   * being able to write to the wrong one by accident.
   */
  shopIds: string[];
  actor: DomainActor;
  /**
   * What this actor may do, resolved from their role and the shop's own
   * overrides. A list rather than a role, so that no caller is tempted to
   * re-derive permissions slightly differently from everybody else.
   *
   * NULL means "could not be worked out" — not "allowed nothing". The two are
   * different questions with different right answers, and conflating them has
   * already caused one incident in each direction:
   *
   *   - Treating unresolved as "nothing" refused every save for a user who
   *     genuinely had permission. That is a lie to a legitimate user, and RLS
   *     was going to allow the write anyway.
   *   - Treating unresolved as "everything" would let an API, MCP or AI caller
   *     that simply forgot to resolve capabilities act unrestricted — which is
   *     the over-permissioning the M0 audit warned about.
   *
   * So the state is recorded rather than inferred from an empty array, and
   * requireCapability decides per actor: a human whose lookup failed is
   * deferred to RLS; a machine caller that never resolved is refused.
   *
   * An EMPTY ARRAY is a real answer: resolution succeeded and this actor may
   * do nothing. That is refused, as it should be.
   */
  capabilities: readonly string[] | null;
  /** Correlates several writes made by one request. Optional. */
  requestId?: string;
}

export class DomainContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainContextError';
  }
}

export interface DomainContextInput {
  organizationId?: string | null;
  shopId: string;
  shopIds?: string[];
  actor: DomainActor;
  /** Omit or pass null when resolution failed. See DomainContext.capabilities. */
  capabilities?: readonly string[] | null;
  requestId?: string;
}

/**
 * Builds a context, refusing the shapes that would silently widen access.
 *
 * A missing shopId is rejected rather than defaulted: the failure mode of a
 * defaulted tenant is reading or writing somebody else's shop, which is worse
 * than an error message.
 */
export function createDomainContext(input: DomainContextInput): DomainContext {
  const shopId = (input.shopId ?? '').trim();
  if (!shopId) throw new DomainContextError('A domain context needs a shopId.');

  if (!input.actor || !ACTOR_TYPES.includes(input.actor.type)) {
    throw new DomainContextError('A domain context needs an actor with a known type.');
  }
  // Deliberately NOT requiring a userId on a user actor. The authoritative
  // actor is stamped by the database (`record_audit_event` reads auth.uid()),
  // so this field is advisory. Requiring it would tempt callers into inventing
  // a placeholder, and a fabricated id in an audit trail is worse than a null
  // one.

  // The write target is always in the read scope, and duplicates are dropped
  // so `.in()` cannot be handed the same id repeatedly.
  const shopIds = [...new Set([shopId, ...(input.shopIds ?? []).filter(Boolean)])];

  return {
    organizationId: input.organizationId ?? null,
    shopId,
    shopIds,
    actor: { ...input.actor },
    capabilities: input.capabilities == null ? null : [...input.capabilities],
    requestId: input.requestId,
  };
}

/**
 * A context for work with no human behind it — a migration, a scheduled job, a
 * back-fill. Kept separate so that "system" can never be produced by accident
 * from a request that simply forgot to identify its user.
 */
export function createSystemContext(shopId: string, organizationId: string | null = null): DomainContext {
  return createDomainContext({
    organizationId,
    shopId,
    actor: { type: 'system', userId: null, role: null },
    // Unrestricted, because a back-fill or scheduled job has no role to
    // resolve and must not silently do half its work. The gate on this
    // context is that it can only be built by server-side code that has
    // already decided the work is authorized — createSystemContext is never
    // reachable from a request.
    capabilities: SYSTEM_CAPABILITIES,
  });
}

/**
 * Whether this context is KNOWN to be allowed something.
 *
 * False for an unresolved context: "we do not know" is not "yes". Callers
 * needing the three-way answer should read `context.capabilities` directly.
 */
export function can(context: DomainContext, capability: string): boolean {
  return context.capabilities !== null && context.capabilities.includes(capability);
}

export class NotPermittedError extends Error {
  readonly capability: string;
  constructor(capability: string, what: string) {
    super(`You do not have permission to ${what}.`);
    this.name = 'NotPermittedError';
    this.capability = capability;
  }
}

/**
 * Refuses unless the context has the capability.
 *
 * Domain-level authorization, which is a SECOND line rather than the only one:
 * RLS still decides what the database will hand over. The value of checking
 * here is that the refusal happens before a partial write, and arrives as a
 * sentence rather than a Postgres error — a caller denied by RLS alone finds
 * out by getting zero rows, which is indistinguishable from "there is nothing
 * there".
 *
 * `what` is the human phrase completing "You do not have permission to …".
 */
export function requireCapability(context: DomainContext, capability: string, what: string): void {
  // Unresolved is not the same as empty, and the right answer differs by who
  // is asking.
  //
  // A HUMAN whose lookup failed — a slow session, a shop switch, a hiccup
  // reading shop_users — genuinely holds the permission; refusing tells them a
  // falsehood and stops work RLS was going to allow anyway. This layer refuses
  // early and explains clearly; it was never the last line, and an
  // authorization layer that locks out legitimate users when its own inputs
  // fail is worse than one that defers to the database.
  //
  // A MACHINE caller — api, mcp, ai, webhook — has no lookup to fail. An
  // unresolved context there means the caller never set capabilities, and
  // "the programmer forgot" must not become "unrestricted". That is precisely
  // the AI over-permissioning the M0 audit warned about, and these are the
  // callers the domain layer exists to serve.
  //
  // The first version of this check inferred both cases from an empty array
  // and answered "defer" to each. It was written in a hurry, during what
  // looked like an outage and turned out to be a browser running months-old
  // JavaScript — capabilities were never the cause. This is what it should
  // have been.
  if (context.capabilities === null) {
    if (context.actor.type === 'user') return;   // defer to RLS
    throw new NotPermittedError(
      capability,
      `${what} — this caller did not resolve its permissions`,
    );
  }

  if (!can(context, capability)) throw new NotPermittedError(capability, what);
}
