/**
 * Key issuing helpers and the browser-safe catalogue (PLAN.md phase 6).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateApiKey } from '../keys';
import { SCOPE_PRESETS, validateIssueKey, toKeyView, activityByKey } from '../keyCatalog';
import { hashApiKey } from '../principal';
import { capabilitiesForScopes } from '../scopes';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('generateApiKey', () => {
  it('makes a rl_live_ secret whose hash and prefix are what is stored', () => {
    const k = generateApiKey();
    expect(k.secret).toMatch(/^rl_live_[0-9a-f]{48}$/);
    expect(k.keyHash).toBe(hashApiKey(k.secret));
    expect(k.secret.startsWith(k.prefix)).toBe(true);
    expect(k.prefix).toHaveLength('rl_live_'.length + 8);
  });

  it('never repeats', () => {
    expect(generateApiKey().secret).not.toBe(generateApiKey().secret);
  });
});

describe('presets', () => {
  it('read only grants no write capability (Wally Bot)', () => {
    const caps = capabilitiesForScopes([...SCOPE_PRESETS.read_only]);
    expect(caps.filter(c => c.endsWith('.manage'))).toEqual([]);
    expect(SCOPE_PRESETS.read_only).not.toContain('pdf:read');
  });

  it('draft writer can write drafts but never move money', () => {
    const caps = capabilitiesForScopes([...SCOPE_PRESETS.draft_writer]);
    expect(caps).toEqual(expect.arrayContaining(['estimates.manage', 'invoices.manage']));
    expect(caps).not.toContain('payments.record');
    expect(caps).not.toContain('payments.reverse');
    expect(caps).not.toContain('customers.manage');
  });
});

describe('validateIssueKey', () => {
  it('trims, de-duplicates and orders scopes', () => {
    expect(validateIssueKey({ name: ' Bot ', scopes: ['pdf:read', 'estimates:read', 'pdf:read'] }))
      .toEqual({ ok: true, value: { name: 'Bot', scopes: ['estimates:read', 'pdf:read'] } });
  });

  it('refuses an unknown scope by name', () => {
    expect(validateIssueKey({ name: 'x', scopes: ['admin'] })).toEqual({ ok: false, reason: 'Unknown permission: admin.' });
  });
});

describe('views', () => {
  it('a key view has no hash', () => {
    const v = toKeyView({ id: 'k', name: 'n', prefix: 'p', key_hash: 'SECRET-HASH', scopes: [], shop_id: 's' });
    expect(JSON.stringify(v)).not.toContain('SECRET-HASH');
    expect(v.allShops).toBe(false);
  });

  it('groups activity by key, newest first, capped per key', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ action: 'a', entity_type: 'estimate', entity_id: `e${i}`, created_at: `t${i}`, metadata: { api_client_id: 'k1' } }));
    rows.push({ action: 'b', entity_type: 'x', entity_id: 'y', created_at: 't', metadata: {} as { api_client_id: string } });
    const map = activityByKey(rows);
    expect(map.get('k1')!.map(a => a.entityId)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
    expect(map.size).toBe(1);
  });
});

describe('the browser never loads the secret-issuing code', () => {
  it('the panel imports the catalogue, not lib/api/keys', () => {
    const panel = read('features/settings/ApiKeysPanel.tsx');
    expect(panel).toMatch(/from '@\/lib\/api\/keyCatalog'/);
    expect(panel).not.toMatch(/from '@\/lib\/api\/keys'/);
  });

  it('the catalogue has no crypto and no database', () => {
    const catalog = read('lib/api/keyCatalog.ts');
    expect(catalog).not.toMatch(/from 'crypto'|supabase|principal/);
  });

  it('lib/api/keys is marked server-only', () => {
    expect(read('lib/api/keys.ts')).toMatch(/^import 'server-only';/m);
  });
});
