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
  });
}
