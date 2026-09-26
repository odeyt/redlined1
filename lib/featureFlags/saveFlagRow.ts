import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Write one feature-flag row, matching it the way the database does.
 *
 * Uniqueness on feature_flags is an EXPRESSION index —
 * feature_flags_unique_scope on (flag_key, scope, COALESCE(shop_id::text,''),
 * COALESCE(user_id::text,''), COALESCE(role,''), COALESCE(environment,''))
 * — because the scope columns are NULL when they do not apply.
 *
 * The routes used `upsert(..., { onConflict: 'flag_key,scope,shop_id,…' })`,
 * which names plain columns. Postgres cannot match that to an expression
 * index and refuses with "there is no unique or exclusion constraint matching
 * the ON CONFLICT specification", so every toggle from Settings failed with a
 * 500. Nobody noticed because the screen had never let an owner in until the
 * shop header was fixed.
 *
 * So: find the row with NULL-aware filters, update it if it exists, insert it
 * if it does not. An insert that loses a race to another request collides on
 * that same index (23505) and falls back to updating the winner.
 */

export interface FlagScopeKey {
  flag_key: string;
  scope: string;
  shop_id: string | null;
  user_id: string | null;
  role: string | null;
  environment: string | null;
}

type Filterable<T> = {
  eq(column: string, value: string): T;
  is(column: string, value: null): T;
};

/** Narrow a query to exactly one scope combination — NULL means "is null", never "any". */
export function matchScope<Q extends Filterable<Q>>(query: Q, key: FlagScopeKey): Q {
  let q = query.eq('flag_key', key.flag_key).eq('scope', key.scope);
  for (const col of ['shop_id', 'user_id', 'role', 'environment'] as const) {
    const v = key[col];
    q = v === null || v === '' ? q.is(col, null) : q.eq(col, v);
  }
  return q;
}

export function normalizeScopeKey(input: {
  flag_key: string; scope?: string | null;
  shop_id?: string | null; user_id?: string | null; role?: string | null; environment?: string | null;
}): FlagScopeKey {
  const orNull = (v: string | null | undefined) => (v === undefined || v === null || v === '' ? null : v);
  return {
    flag_key: input.flag_key,
    scope: input.scope || 'global',
    shop_id: orNull(input.shop_id),
    user_id: orNull(input.user_id),
    role: orNull(input.role),
    environment: orNull(input.environment),
  };
}

export async function saveFlagRow(
  db: SupabaseClient,
  key: FlagScopeKey,
  fields: { enabled: boolean; display_name?: string; description?: string },
): Promise<{ error: string | null; created: boolean }> {
  const update = async (): Promise<{ found: boolean; error: string | null }> => {
    const { data, error } = await matchScope(
      db.from('feature_flags').update({ ...fields, updated_at: new Date().toISOString() }),
      key,
    ).select('id');
    if (error) return { found: false, error: error.message };
    return { found: (data ?? []).length > 0, error: null };
  };

  const first = await update();
  if (first.error) return { error: first.error, created: false };
  if (first.found) return { error: null, created: false };

  const { error: insertError } = await db.from('feature_flags').insert({
    ...key,
    enabled: fields.enabled,
    display_name: fields.display_name ?? key.flag_key,
    description: fields.description ?? '',
  });
  if (!insertError) return { error: null, created: true };

  // Another request inserted the same scope between our update and insert.
  if ((insertError as { code?: string }).code === '23505') {
    const again = await update();
    return { error: again.error, created: false };
  }
  return { error: insertError.message, created: false };
}
