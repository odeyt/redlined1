-- =============================================================================
-- cli_login_postgres - dependency audit before disabling or dropping (READ ONLY)
-- =============================================================================
-- Run in the Supabase SQL Editor as postgres. It changes nothing: one read-only
-- transaction, rolled back. There is no parameter to edit.
--
-- WHY THIS EXISTS
-- cli_login_postgres is an expired login role that still exists, and the pg_net
-- audit showed it still inherits PUBLIC's access to the outbound HTTP queue.
-- Dropping a role is not reversible in place: PostgreSQL refuses while the role
-- owns anything, and grants it issued disappear with it. This establishes what
-- depends on the role BEFORE anything is disabled or dropped.
--
-- WHAT IT NEVER READS
-- No password hash (only whether one is set, and only if pg_authid is
-- readable), and no pg_stat_activity query text. Nothing is altered, reassigned,
-- dropped, granted or revoked: this file contains no such statement.
--
-- SCOPE
-- pg_shdepend, pg_class, pg_proc, pg_policy and pg_default_acl are per-database.
-- Run this in EVERY database the role could own something in; on Supabase that
-- is normally `postgres` alone. Row 41 reports which database it ran in.
--
-- HOW TO READ IT
-- Verdicts: BLOCKS (this stops a DROP), REVIEW (a human decision), RECORD,
-- INFO, PASS. Row 900 says whether NOLOGIN is safe, row 901 whether DROP is,
-- and row 999 combines them.
-- =============================================================================
BEGIN TRANSACTION READ ONLY;

WITH
target AS (
  SELECT r.oid, r.rolname, r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreaterole,
    r.rolcreatedb, r.rolinherit, r.rolreplication, r.rolconnlimit, r.rolvaliduntil,
    array_to_string(r.rolconfig, ', ') AS config
  FROM pg_roles r WHERE r.rolname = 'cli_login_postgres'
),
can_read_authid AS (SELECT has_table_privilege(current_user, 'pg_catalog.pg_authid', 'SELECT') AS yes),

-- Sessions: identity and timing only, never the statement being run.
sessions AS (
  SELECT count(*) AS n,
    coalesce(string_agg(DISTINCT coalesce(a.datname::text, '(none)') || '/' || coalesce(a.state, '(no state)'), ', '), '') AS detail,
    to_char(min(a.backend_start) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS oldest
  FROM pg_stat_activity a JOIN target t ON a.usename = t.rolname
),

-- Membership in both directions. A member can SET ROLE to it, which no password
-- expiry prevents.
memberships AS (
  SELECT string_agg(m.roleid::regrole::text || CASE WHEN m.admin_option THEN ' (admin)' ELSE '' END, ', '
           ORDER BY m.roleid::regrole::text) AS txt
  FROM pg_auth_members m JOIN target t ON m.member = t.oid
),
members AS (
  SELECT string_agg(m.member::regrole::text || CASE WHEN m.admin_option THEN ' (admin)' ELSE '' END, ', '
           ORDER BY m.member::regrole::text) AS txt
  FROM pg_auth_members m JOIN target t ON m.roleid = t.oid
),
set_role_reach AS (
  -- A superuser can SET ROLE to anything, so it is listed but does not by itself
  -- make this a decision; a non-superuser that can reach the role does.
  SELECT string_agg(r.rolname || CASE WHEN r.rolsuper THEN ' (superuser)' ELSE '' END, ', ' ORDER BY r.rolname) AS txt,
    count(*) FILTER (WHERE NOT r.rolsuper) AS n_ordinary
  FROM pg_roles r, target t
  WHERE r.rolcanlogin AND r.rolname <> t.rolname AND pg_has_role(r.rolname, t.oid, 'SET')
),

-- Ownership and every other shared dependency, in THIS database.
owned_rel AS (
  SELECT count(*) AS n,
    coalesce(string_agg(n.nspname || '.' || c.relname || ' (' || c.relkind::text || ')', ', '
      ORDER BY n.nspname, c.relname), '') AS txt
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN target t ON c.relowner = t.oid
),
owned_proc AS (
  SELECT count(*) AS n,
    coalesce(string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname, p.proname), '') AS txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN target t ON p.proowner = t.oid
),
owned_nsp AS (
  SELECT count(*) AS n, coalesce(string_agg(n.nspname, ', ' ORDER BY n.nspname), '') AS txt
  FROM pg_namespace n JOIN target t ON n.nspowner = t.oid
),
owned_type AS (
  -- Standalone types only. A table's row type and its array type are owned by
  -- whoever owns the table and disappear with it, so counting them would report
  -- the same dependency three times.
  SELECT count(*) AS n, coalesce(string_agg(ty.typname, ', ' ORDER BY ty.typname), '') AS txt
  FROM pg_type ty JOIN target t ON ty.typowner = t.oid
  WHERE ty.typcategory <> 'A'
    AND (ty.typtype <> 'c' OR (SELECT c.relkind FROM pg_class c WHERE c.oid = ty.typrelid) = 'c')
),
owned_db AS (
  SELECT count(*) AS n, coalesce(string_agg(d.datname, ', ' ORDER BY d.datname), '') AS txt
  FROM pg_database d JOIN target t ON d.datdba = t.oid
),
shdep AS (
  SELECT count(*) AS n,
    coalesce(string_agg(x.descr, '; ' ORDER BY x.descr), '') AS txt
  FROM (
    SELECT s.classid::regclass::text || ' x' || count(*)::text
      || ' [' || CASE s.deptype WHEN 'o' THEN 'owner' WHEN 'a' THEN 'acl' WHEN 'r' THEN 'policy'
                                WHEN 't' THEN 'tablespace' ELSE s.deptype::text END || ']' AS descr
    FROM pg_shdepend s JOIN target t ON s.refobjid = t.oid
    WHERE s.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
    GROUP BY s.classid, s.deptype
  ) x
),

-- Grants this role issued. They vanish with the role, so each one is a change.
issued AS (
  SELECT count(*) AS n, coalesce(string_agg(x.descr, '; ' ORDER BY x.descr), '') AS txt
  FROM (
    SELECT n.nspname || '.' || c.relname || ' -> ' || a.grantee::regrole::text || ' ' || a.privilege_type AS descr
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(c.relacl) a, target t
    WHERE a.grantor = t.oid
    UNION ALL
    SELECT n.nspname || '.' || p.proname || '() -> ' || a.grantee::regrole::text || ' ' || a.privilege_type
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(p.proacl) a, target t
    WHERE a.grantor = t.oid
    UNION ALL
    SELECT 'schema ' || n.nspname || ' -> ' || a.grantee::regrole::text || ' ' || a.privilege_type
    FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a, target t
    WHERE a.grantor = t.oid
    UNION ALL
    SELECT 'type ' || ty.typname || ' -> ' || a.grantee::regrole::text || ' ' || a.privilege_type
    FROM pg_type ty, LATERAL aclexplode(ty.typacl) a, target t
    WHERE a.grantor = t.oid
  ) x
),
def_acl AS (
  SELECT count(*) AS n,
    coalesce(string_agg(coalesce(n.nspname, '(any schema)') || ' ' || d.defaclobjtype::text || ': ' || d.defaclacl::text, '; '), '') AS txt
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace JOIN target t ON d.defaclrole = t.oid
),
policies AS (
  SELECT count(*) AS n,
    coalesce(string_agg(n.nspname || '.' || c.relname || '.' || p.polname, ', ' ORDER BY p.polname), '') AS txt
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace, target t
  WHERE t.oid = ANY (p.polroles)
),
blockers AS (
  SELECT (SELECT n FROM owned_rel) + (SELECT n FROM owned_proc) + (SELECT n FROM owned_nsp)
       + (SELECT n FROM owned_type) + (SELECT n FROM owned_db) + (SELECT n FROM issued)
       + (SELECT n FROM def_acl) + (SELECT n FROM policies) AS n
),

checks (ord, section, item, expected, actual, verdict) AS (
  SELECT 10, 'A the role', 'cli_login_postgres exists', '(record)',
    coalesce((SELECT 'yes: login=' || t.rolcanlogin::text || ', superuser=' || t.rolsuper::text
                || ', bypassrls=' || t.rolbypassrls::text || ', createrole=' || t.rolcreaterole::text
                || ', createdb=' || t.rolcreatedb::text || ', inherit=' || t.rolinherit::text
                || ', replication=' || t.rolreplication::text || ', connlimit=' || t.rolconnlimit::text
                || ', config=' || coalesce(nullif(t.config, ''), '(none)') FROM target t), 'no: the role is absent'),
    CASE WHEN EXISTS (SELECT 1 FROM target) THEN 'RECORD' ELSE 'PASS' END
  UNION ALL
  SELECT 11, 'A the role', 'VALID UNTIL, and whether it has passed', '(record)',
    coalesce((SELECT CASE WHEN t.rolvaliduntil IS NULL THEN 'no expiry set'
                          ELSE to_char(t.rolvaliduntil AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
                               || CASE WHEN t.rolvaliduntil < now() THEN ' (EXPIRED)' ELSE ' (still valid)' END END
              FROM target t), '(role absent)'),
    CASE WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'PASS'
         WHEN EXISTS (SELECT 1 FROM target WHERE rolvaliduntil IS NOT NULL AND rolvaliduntil < now()) THEN 'RECORD'
         ELSE 'REVIEW' END
  UNION ALL
  SELECT 12, 'A the role', 'what expiry does NOT prevent', '(read this before relying on it)',
    'VALID UNTIL rejects password authentication only. It does not stop SET ROLE by a member, '
      || 'and it does not apply to non-password authentication. See rows 31 and 32.',
    'INFO'
  UNION ALL
  SELECT 13, 'A the role', 'password set (the hash itself is never read)', '(record)',
    CASE WHEN NOT (SELECT yes FROM can_read_authid) THEN 'not readable (needs pg_authid)'
         ELSE coalesce((SELECT CASE WHEN a.rolpassword IS NULL THEN 'no password' ELSE 'password set' END
                          FROM pg_authid a JOIN target t ON a.oid = t.oid), '(role absent)') END,
    'RECORD'

  UNION ALL
  SELECT 20, 'B sessions', 'sessions open as this role right now (no query text is read)', '0',
    coalesce((SELECT n::text || CASE WHEN n > 0 THEN ' (' || detail || ', oldest ' || coalesce(oldest, '-') || ')' ELSE '' END
              FROM sessions), '0'),
    CASE WHEN (SELECT n FROM sessions) = 0 THEN 'PASS' ELSE 'BLOCKS' END

  UNION ALL
  SELECT 30, 'C reachability', 'roles this role is a member of', '(record)',
    coalesce((SELECT nullif(txt, '') FROM memberships), '(none)'), 'RECORD'
  UNION ALL
  SELECT 31, 'C reachability', 'roles that are members of it (they inherit whatever it holds)', '(none)',
    coalesce((SELECT nullif(txt, '') FROM members), '(none)'),
    CASE WHEN (SELECT nullif(txt, '') FROM members) IS NULL THEN 'PASS' ELSE 'REVIEW' END
  UNION ALL
  SELECT 32, 'C reachability', 'login roles that can SET ROLE to it (expiry does not stop this)', '(none)',
    coalesce((SELECT nullif(txt, '') FROM set_role_reach), '(none)'),
    CASE WHEN coalesce((SELECT n_ordinary FROM set_role_reach), 0) > 0 THEN 'REVIEW' ELSE 'PASS' END

  UNION ALL
  SELECT 40, 'D what it owns', 'tables, views and sequences owned', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM owned_rel),
    CASE WHEN (SELECT n FROM owned_rel) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 41, 'D what it owns', 'database this audit ran in (pg_shdepend is per-database)', '(record)',
    current_database(), 'INFO'
  UNION ALL
  SELECT 42, 'D what it owns', 'functions owned', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM owned_proc),
    CASE WHEN (SELECT n FROM owned_proc) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 43, 'D what it owns', 'schemas owned', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM owned_nsp),
    CASE WHEN (SELECT n FROM owned_nsp) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 44, 'D what it owns', 'types owned', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM owned_type),
    CASE WHEN (SELECT n FROM owned_type) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 45, 'D what it owns', 'databases owned', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM owned_db),
    CASE WHEN (SELECT n FROM owned_db) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 46, 'D what it owns', 'every shared dependency recorded for it', '(record)',
    (SELECT CASE WHEN n = 0 THEN '(none)' ELSE txt END FROM shdep),
    CASE WHEN (SELECT n FROM shdep) = 0 THEN 'PASS' ELSE 'RECORD' END

  UNION ALL
  SELECT 50, 'E what it granted', 'grants it issued (these disappear with the role)', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM issued),
    CASE WHEN (SELECT n FROM issued) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 51, 'E what it granted', 'default privileges it created', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM def_acl),
    CASE WHEN (SELECT n FROM def_acl) = 0 THEN 'PASS' ELSE 'BLOCKS' END
  UNION ALL
  SELECT 60, 'F policies', 'row-level security policies naming it', '0',
    (SELECT n::text || CASE WHEN n > 0 THEN ': ' || txt ELSE '' END FROM policies),
    CASE WHEN (SELECT n FROM policies) = 0 THEN 'PASS' ELSE 'BLOCKS' END

  UNION ALL
  SELECT 900, 'VERDICT', 'is ALTER ROLE ... NOLOGIN safe? (reversible in one statement)', 'safe',
    CASE WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not applicable: the role is absent'
         WHEN (SELECT n FROM sessions) > 0 THEN 'NOT YET: ' || (SELECT n::text FROM sessions)
              || ' session(s) are open as this role; a NOLOGIN does not close them, but find out what they are first'
         ELSE 'safe: no session is open, and LOGIN can be restored in one statement' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'PASS'
         WHEN (SELECT n FROM sessions) > 0 THEN 'REVIEW' ELSE 'PASS' END
  UNION ALL
  SELECT 901, 'VERDICT', 'is DROP ROLE safe? (not reversible in place)', 'safe',
    CASE WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not applicable: the role is absent'
         WHEN (SELECT n FROM blockers) > 0 OR (SELECT n FROM sessions) > 0
         THEN 'NO: ' || (SELECT n::text FROM blockers) || ' owned object(s), issued grant(s), default ACL(s) or policy reference(s)'
              || ' and ' || (SELECT n::text FROM sessions) || ' open session(s). Reassign or drop those first, and record them for rollback'
         ELSE 'safe on the evidence here: nothing in THIS database depends on it. Re-run in every other database before dropping' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'PASS'
         WHEN (SELECT n FROM blockers) > 0 OR (SELECT n FROM sessions) > 0 THEN 'BLOCKS' ELSE 'PASS' END
)
SELECT ord, section, item, expected, actual, verdict FROM checks
UNION ALL
SELECT 999, 'VERDICT', 'what may be done now', 'disable first, drop later',
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'BLOCKS')
       THEN 'NOLOGIN only. ' || (SELECT count(*)::text FROM checks WHERE verdict = 'BLOCKS' AND ord < 900) || ' finding(s) block a DROP'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'REVIEW')
       THEN 'NOLOGIN now; a DROP needs the REVIEW rows answered first'
       ELSE 'NOLOGIN now; a DROP looks safe in this database once the soak period passes' END,
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'BLOCKS') THEN 'BLOCKS'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'REVIEW') THEN 'REVIEW' ELSE 'PASS' END
ORDER BY ord;

ROLLBACK;
