/**
 * lib/entitlements/permissionService.ts
 *
 * Central Permission Service.
 *
 * Entitlements and user permissions are separate concerns:
 *   Entitlement = "Does the workspace subscription include this?"
 *   Permission  = "Is this user allowed to do this in this workspace?"
 *
 * This service evaluates the full chain:
 *   Authenticated → Workspace member → Role permits → Plan includes → Usage available
 *
 * Server-side only.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { checkFeatureAccess, checkUsageAccess, getEffectivePlanKey } from './entitlementEngine';
import { INTERNAL_SHOP_IDS } from './planRegistry';
import type { FeatureKey, UsageMetricKey } from './featureRegistry';
import type { EntitlementResult } from './types';

// ─── Role definitions ─────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'advisor' | 'technician' | 'viewer';

/** Roles that can perform write/mutate operations */
const WRITE_ROLES = new Set<WorkspaceRole>(['owner', 'admin', 'manager', 'advisor']);

/** Roles that can manage billing and settings */
const ADMIN_ROLES = new Set<WorkspaceRole>(['owner', 'admin']);

/** Roles that can invite team members */
const INVITE_ROLES = new Set<WorkspaceRole>(['owner', 'admin', 'manager']);

// ─── Access decision shape ────────────────────────────────────────────────────

export interface AccessDecision {
  allowed: boolean;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole | null;
  /** null when not checked */
  entitlement: EntitlementResult | null;
  reasonCode: AccessReasonCode;
  userMessage: string;
}

export type AccessReasonCode =
  | 'ALLOWED'
  | 'NOT_AUTHENTICATED'
  | 'NOT_WORKSPACE_MEMBER'
  | 'ROLE_INSUFFICIENT'
  | 'PLAN_INSUFFICIENT'
  | 'USAGE_LIMIT_REACHED'
  | 'INTERNAL_OVERRIDE';

// ─── Workspace membership ─────────────────────────────────────────────────────

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<{ role: WorkspaceRole } | null> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from('shop_users')
      .select('role')
      .eq('user_id', userId)
      .eq('shop_id', workspaceId)
      .maybeSingle();
    if (!data?.role) return null;
    return { role: data.role as WorkspaceRole };
  } catch {
    return null;
  }
}

// ─── Main authorization entry point ──────────────────────────────────────────

export interface AuthorizeActionInput {
  userId: string;
  workspaceId: string;
  /** Require at least this capability level */
  requireRole?: 'write' | 'admin' | 'invite' | 'any';
  featureKey?: FeatureKey;
  metricKey?: UsageMetricKey;
  requestedQuantity?: number;
}

/**
 * Evaluates authentication, membership, role, plan, and usage in sequence.
 * Returns the first denial reason found, or ALLOWED if all checks pass.
 */
export async function authorizeWorkspaceAction(
  input: AuthorizeActionInput,
): Promise<AccessDecision> {
  const { userId, workspaceId } = input;

  // 1. Must be a workspace member
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) {
    return {
      allowed: false,
      userId,
      workspaceId,
      role: null,
      entitlement: null,
      reasonCode: 'NOT_WORKSPACE_MEMBER',
      userMessage: 'You are not a member of this workspace.',
    };
  }

  const { role } = membership;

  // 2. Internal D1 shops bypass role + entitlement checks
  if (INTERNAL_SHOP_IDS.has(workspaceId)) {
    return {
      allowed: true,
      userId,
      workspaceId,
      role,
      entitlement: null,
      reasonCode: 'INTERNAL_OVERRIDE',
      userMessage: 'Internal shop — full access.',
    };
  }

  // 3. Role check
  const roleRequired = input.requireRole ?? 'any';
  const roleAllowed =
    roleRequired === 'any' ? true :
    roleRequired === 'write' ? WRITE_ROLES.has(role) :
    roleRequired === 'admin' ? ADMIN_ROLES.has(role) :
    roleRequired === 'invite' ? INVITE_ROLES.has(role) :
    true;

  if (!roleAllowed) {
    return {
      allowed: false,
      userId,
      workspaceId,
      role,
      entitlement: null,
      reasonCode: 'ROLE_INSUFFICIENT',
      userMessage: `Your role (${role}) does not permit this action.`,
    };
  }

  // 4. Feature entitlement check
  if (input.featureKey) {
    const entitlement = await checkFeatureAccess(workspaceId, input.featureKey);
    if (!entitlement.allowed) {
      return {
        allowed: false,
        userId,
        workspaceId,
        role,
        entitlement,
        reasonCode: 'PLAN_INSUFFICIENT',
        userMessage: entitlement.userMessage,
      };
    }
  }

  // 5. Usage entitlement check
  if (input.metricKey) {
    const entitlement = await checkUsageAccess(
      workspaceId,
      input.metricKey,
      input.requestedQuantity ?? 1,
    );
    if (!entitlement.allowed) {
      return {
        allowed: false,
        userId,
        workspaceId,
        role,
        entitlement,
        reasonCode: 'USAGE_LIMIT_REACHED',
        userMessage: entitlement.userMessage,
      };
    }
  }

  return {
    allowed: true,
    userId,
    workspaceId,
    role,
    entitlement: null,
    reasonCode: 'ALLOWED',
    userMessage: 'Allowed.',
  };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Returns the workspace ID for a user (their primary shop).
 * Used to resolve workspaceId from userId in API routes.
 */
export async function getWorkspaceIdForUser(userId: string): Promise<string | null> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from('shop_users')
      .select('shop_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.shop_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Quick check: is userId a member of workspaceId with at least write access?
 */
export async function canWrite(userId: string, workspaceId: string): Promise<boolean> {
  const m = await getWorkspaceMembership(userId, workspaceId);
  return !!m && WRITE_ROLES.has(m.role);
}

/**
 * Quick check: is userId an owner or admin of workspaceId?
 */
export async function isAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const m = await getWorkspaceMembership(userId, workspaceId);
  return !!m && ADMIN_ROLES.has(m.role);
}
