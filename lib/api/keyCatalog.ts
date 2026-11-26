/**
 * API keys: the parts the browser may load (Settings → API Keys panel) as
 * well as the server. No crypto, no database. Issuing a secret lives in
 * lib/api/keys.ts, which is server-only.
 */
import { API_SCOPES, isApiScope, type ApiScope } from './scopes';

/**
 * Ready-made scope sets, matching the rollout the owner approved: Wally Bot
 * reads only; the CRM bot may also write drafts and fetch PDFs.
 */
export const SCOPE_PRESETS: Record<'read_only' | 'draft_writer', readonly ApiScope[]> = {
  read_only: ['customers:read', 'vehicles:read', 'estimates:read', 'invoices:read'],
  draft_writer: [
    'customers:read', 'vehicles:read', 'estimates:read', 'invoices:read',
    'estimates:write', 'invoices:write', 'pdf:read',
  ],
};

export type IssueKeyInput = { name: string; scopes: string[] };

/** Validates an issue request; returns the clean input or a reason. */
export function validateIssueKey(raw: unknown): { ok: true; value: IssueKeyInput } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Send a name and scopes.' };
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, reason: 'Give the key a name, such as "Wally Bot".' };
  if (name.length > 80) return { ok: false, reason: 'Key names are 80 characters or fewer.' };
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return { ok: false, reason: 'Choose at least one permission.' };
  }
  const scopes = [...new Set(body.scopes.map(s => String(s).trim()))];
  const unknown = scopes.filter(s => !isApiScope(s));
  if (unknown.length) return { ok: false, reason: `Unknown permission: ${unknown.join(', ')}.` };
  // Keep the catalogue order, so the same set always reads the same way.
  return { ok: true, value: { name, scopes: API_SCOPES.filter(s => scopes.includes(s)) } };
}

/** What the screen shows for a key. Never the hash, never the secret. */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  /** True for an organization-wide key (issued by an operator, not here). */
  allShops: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  activity: { action: string; entityType: string; entityId: string; at: string }[];
}

type Row = Record<string, unknown>;

export function toKeyView(row: Row, activity: ApiKeyView['activity'] = []): ApiKeyView {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    prefix: String(row.prefix ?? ''),
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    allShops: !row.shop_id,
    createdAt: (row.created_at as string) ?? null,
    lastUsedAt: (row.last_used_at as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    activity,
  };
}

/** Recent API audit rows grouped by the key that made them (newest first). */
export function activityByKey(rows: Row[], perKey = 5): Map<string, ApiKeyView['activity']> {
  const out = new Map<string, ApiKeyView['activity']>();
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Row;
    const keyId = typeof meta.api_client_id === 'string' ? meta.api_client_id : null;
    if (!keyId) continue;
    const list = out.get(keyId) ?? [];
    if (list.length >= perKey) continue;
    list.push({
      action: String(r.action ?? ''),
      entityType: String(r.entity_type ?? ''),
      entityId: String(r.entity_id ?? ''),
      at: String(r.created_at ?? ''),
    });
    out.set(keyId, list);
  }
  return out;
}
