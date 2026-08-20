/**
 * The relay.
 *
 * The mapping between the outbox and the bus store is the part worth testing
 * hardest: the two tables name the same things differently — `id` against
 * `event_id`, `created_at` against `timestamp` — and a wrong column name reads
 * as correct code while writing nulls forever. That exact bug shipped in this
 * project once already, in the parts-order audit snapshots.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { relayOnce, toBusEvent, unroutableReason, type OutboxEvent } from '../relay';
import type { SupabaseClient } from '@supabase/supabase-js';

function event(over: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 'e-1',
    organization_id: 'org-1',
    shop_id: 'shop-1',
    event_type: 'invoice.issued',
    payload: { invoiceNumber: 'INV-1' },
    aggregate_type: 'invoice',
    aggregate_id: 'INV-1',
    actor_user_id: 'u-1',
    actor_type: 'user',
    correlation_id: null,
    created_at: '2026-08-20T10:00:00Z',
    attempts: 0,
    ...over,
  };
}

function fakeDb(claimed: OutboxEvent[], insertError: { code?: string; message: string } | null = null) {
  const inserted: Record<string, unknown>[] = [];
  const settled: { id: string; ok: boolean; error?: string }[] = [];

  const db = {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'claim_domain_events') return Promise.resolve({ data: claimed, error: null });
      if (fn === 'settle_domain_event') {
        settled.push({
          id: args.p_id as string,
          ok: args.p_ok as boolean,
          error: args.p_error as string | undefined,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from() {
      return {
        insert: (row: Record<string, unknown>) => {
          if (!insertError) inserted.push(row);
          return Promise.resolve({ error: insertError });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { db, inserted, settled };
}

describe('mapping an outbox row onto the bus store', () => {
  it('uses the store\'s column names, not the queue\'s', () => {
    const row = toBusEvent(event());
    expect(row.event_id).toBe('e-1');
    expect(row.timestamp).toBe('2026-08-20T10:00:00Z');
    // The names the outbox uses must not appear at all.
    expect(row.id).toBeUndefined();
    expect(row.created_at).toBeUndefined();
  });

  it('gives an uncorrelated event itself as its correlation', () => {
    // correlation_id is NOT NULL on the store. Its own id is more useful than
    // a placeholder, and it makes a single event a chain of one.
    expect(toBusEvent(event({ correlation_id: null })).correlation_id).toBe('e-1');
  });

  it('keeps a real correlation id when there is one', () => {
    expect(toBusEvent(event({ correlation_id: 'chain-9' })).correlation_id).toBe('chain-9');
  });

  it('carries the actor into the payload', () => {
    // The store has no actor column, and "who did this" is the question an
    // event log exists to answer.
    const payload = toBusEvent(event()).payload as Record<string, unknown>;
    expect(payload.actor).toEqual({ userId: 'u-1', type: 'user' });
  });

  it('carries the aggregate into the payload', () => {
    const payload = toBusEvent(event()).payload as Record<string, unknown>;
    expect(payload.aggregate).toEqual({ type: 'invoice', id: 'INV-1' });
  });

  it('stringifies the organization id, which the store holds as text', () => {
    expect(typeof toBusEvent(event()).organization_id).toBe('string');
  });
});

describe('events the store cannot accept', () => {
  it('names a missing shop', () => {
    expect(unroutableReason(event({ shop_id: null }))).toMatch(/no shop_id/);
  });

  it('names a missing organization', () => {
    expect(unroutableReason(event({ organization_id: null }))).toMatch(/no organization_id/);
  });

  it('passes a complete event', () => {
    expect(unroutableReason(event())).toBeNull();
  });

  it('kills an unroutable event immediately rather than retrying it', async () => {
    // Retrying something that fails identically every time hides it among the
    // transient failures for four hours.
    const { db, settled, inserted } = fakeDb([event({ shop_id: null })]);
    const result = await relayOnce(db);
    expect(result.unroutable).toBe(1);
    expect(inserted).toHaveLength(0);
    expect(settled.length).toBeGreaterThanOrEqual(8);
    expect(settled.every(s => s.ok === false)).toBe(true);
  });
});

describe('one pass', () => {
  it('writes a claimed event and settles it', async () => {
    const { db, inserted, settled } = fakeDb([event()]);
    const result = await relayOnce(db);
    expect(result.claimed).toBe(1);
    expect(result.written).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(settled).toEqual([{ id: 'e-1', ok: true, error: undefined }]);
  });

  it('does nothing when the queue is empty', async () => {
    const { db, settled } = fakeDb([]);
    const result = await relayOnce(db);
    expect(result).toMatchObject({ claimed: 0, written: 0, failed: 0 });
    expect(settled).toHaveLength(0);
  });

  it('treats an already-stored event as delivered', async () => {
    // A relay that died between writing and settling redelivers. The write
    // already happened, so a duplicate key is success.
    const { db, settled } = fakeDb([event()], { code: '23505', message: 'duplicate key' });
    const result = await relayOnce(db);
    expect(result.written).toBe(1);
    expect(settled[0].ok).toBe(true);
  });

  it('settles a real failure as a failure, with the reason', async () => {
    const { db, settled } = fakeDb([event()], { message: 'connection reset' });
    const result = await relayOnce(db);
    expect(result.failed).toBe(1);
    expect(settled[0]).toMatchObject({ ok: false, error: 'connection reset' });
  });
});

describe('the migration says what the relay assumes', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-20_m12_domain_event_outbox.sql'),
    'utf8',
  );

  it('claims rows atomically', () => {
    // Without SKIP LOCKED two relays read the same pending rows and both
    // deliver them. The Sapelee flush works around exactly this with a
    // workflow concurrency group.
    expect(SQL).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('reclaims rows from a relay that died', () => {
    expect(SQL).toMatch(/claimed_at < now\(\) - interval '5 minutes'/);
  });

  it('stops retrying rather than retrying forever', () => {
    // 'dead' is a deliberate stop. Endless retries are how a broken endpoint
    // becomes invisible.
    expect(SQL).toMatch(/THEN 'dead'/);
  });

  it('backs off exponentially, capped', () => {
    expect(SQL).toMatch(/least\(power\(2, v_attempts\)/);
    expect(SQL).toMatch(/interval '1 hour'/);
  });

  it('lets no browser claim or settle events', () => {
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_domain_events\(INT, TEXT\) TO service_role;/);
    expect(SQL).not.toMatch(/claim_domain_events[^;]*TO authenticated/);
  });

  it('lets no browser edit the queue', () => {
    expect(SQL).toMatch(/GRANT SELECT, INSERT ON public\.domain_event_outbox TO authenticated;/);
    expect(SQL).not.toMatch(/GRANT[^;]*UPDATE[^;]*domain_event_outbox/);
  });

  it('refuses an event queued as anything but pending', () => {
    expect(SQL).toMatch(/status = 'pending'\s*\n\s*AND EXISTS/);
  });
});
