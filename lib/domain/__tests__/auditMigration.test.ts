/**
 * The audit table's guarantees, pinned to the migration that creates them.
 *
 * These are source assertions rather than database tests because this
 * repository has no harness that runs migrations. That is a real limitation
 * and is recorded as such — the runtime proof is the rolled-back transaction
 * in the migration's own verification block, which must be executed before the
 * migration is trusted. A clean CREATE FUNCTION proves only that PL/pgSQL
 * parsed; a trigger that passed exactly that check once blocked every invoice
 * payment for three days.
 *
 * What these tests do catch is the more likely regression: somebody later
 * "simplifying" the migration and removing a lock.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-16_m1_domain_foundation.sql'),
  'utf8',
);
// The file explains each guarantee at length; matching against prose would let
// a test pass on its own commentary.
const CODE = SQL.replace(/^\s*--.*$/gm, '');

describe('audit_events cannot be rewritten', () => {
  it('revokes UPDATE and DELETE from every application role', () => {
    expect(CODE).toMatch(/REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+public\.audit_events/i);
    expect(CODE).toMatch(/FROM\s+authenticated,\s*anon,\s*service_role/i);
  });

  it('also blocks it with a trigger, because a grant is not the only path in', () => {
    expect(CODE).toMatch(/BEFORE UPDATE OR DELETE ON public\.audit_events/i);
    expect(CODE).toMatch(/RAISE EXCEPTION 'audit_events is append-only/);
  });

  it('grants no INSERT to clients — rows arrive only through the function', () => {
    expect(CODE).not.toMatch(/GRANT[^;]*INSERT[^;]*ON\s+public\.audit_events/i);
  });

  it('has RLS enabled', () => {
    expect(CODE).toMatch(/ALTER TABLE public\.audit_events ENABLE ROW LEVEL SECURITY/i);
  });

  it('restricts reading to owners and managers', () => {
    // Before/after snapshots of financial records; once payroll arrives this
    // policy is the seam that keeps salary out of general view.
    expect(CODE).toMatch(/CREATE POLICY audit_events_select_managers[\s\S]*?FOR SELECT/i);
    expect(CODE).toMatch(/su\.role IN \('owner', 'manager'\)/);
  });
});

describe('the audit writer function', () => {
  it('stamps the actor itself rather than trusting an argument', () => {
    // An actor id supplied by the caller could be forged, which would make the
    // log worse than useless.
    expect(CODE).toMatch(/v_actor\s+UUID\s*:=\s*auth\.uid\(\)/);
    expect(CODE).not.toMatch(/p_actor_user_id/);
  });

  it('verifies shop membership before writing', () => {
    expect(CODE).toMatch(/FROM public\.shop_users su[\s\S]*?su\.user_id = v_actor AND su\.shop_id = p_shop_id/);
    expect(CODE).toMatch(/RAISE EXCEPTION 'Not a member of this shop'/);
  });

  it('derives the organization from the shop instead of accepting one', () => {
    expect(CODE).toMatch(/SELECT s\.organization_id INTO v_org/);
  });

  it('is revoked from PUBLIC before being granted', () => {
    // Postgres grants EXECUTE to PUBLIC by default, so creating the function
    // and stopping there would let anonymous callers write audit rows.
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.record_audit_event[\s\S]*?FROM PUBLIC/i);
    expect(CODE).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_audit_event[\s\S]*?TO authenticated, service_role/i);
  });

  it('pins its search_path, as a SECURITY DEFINER function must', () => {
    expect(CODE).toMatch(/SECURITY DEFINER[\s\S]{0,80}SET search_path TO 'public'/);
  });
});

describe('the organizations tier is additive', () => {
  it('adds a nullable column rather than a required one', () => {
    // NOT NULL would make a shop insert from an un-updated code path fail, and
    // provisioning a new customer is not something this milestone may break.
    expect(CODE).toMatch(/ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public\.organizations\(id\)/i);
    expect(CODE).not.toMatch(/organization_id UUID NOT NULL/i);
  });

  it('back-fills every existing shop', () => {
    expect(CODE).toMatch(/UPDATE public\.shops s\s*\nSET organization_id/);
  });

  it('leaves the legacy audit_logs table completely alone', () => {
    // Rewriting a table while claiming to be additive is how a "safe"
    // migration loses data.
    expect(CODE).not.toMatch(/audit_logs/);
  });

  it('is reversible, and says how', () => {
    expect(SQL).toMatch(/Rollback/i);
    expect(SQL).toMatch(/DROP TABLE IF EXISTS public\.audit_events/);
    expect(SQL).toMatch(/ALTER TABLE public\.shops DROP COLUMN IF EXISTS organization_id/);
  });

  it('tells the operator to execute the function body before trusting it', () => {
    expect(SQL).toMatch(/rolled-back transaction/i);
  });
});
