-- =============================================================================
-- PHASE A - pg_net privilege audit (READ ONLY)
-- =============================================================================
-- Run in the Supabase SQL Editor as postgres. It changes nothing: one read-only
-- transaction, rolled back. It takes no parameter, so there is nothing to edit.
--
-- WHY THIS EXISTS
-- OWNER START SQL found that PUBLIC, anon and authenticated hold effective
-- table privileges on pg_net's queue and response tables, can read the queued
-- request headers (which carry the push secret), hold privileges on the
-- request-id sequence, and can execute pg_net's request, response and
-- worker-control functions. This audit establishes the full picture that any
-- remediation must be written against: who holds what, who owns what, what
-- re-grants it, what the pg_net worker itself needs, and which login roles
-- could use any of it.
--
-- WHAT IT NEVER READS
-- No queued request headers or bodies, no response headers or content, no Vault
-- value, no password hash, and no pg_stat_activity query text. Column names
-- appear only as arguments to has_column_privilege, which answers yes or no.
-- Function source is printed only for extensions.grant_pg_net_access, and only
-- when it contains no secret-shaped text; otherwise its md5 is printed instead.
--
-- HOW TO READ IT
-- One row per finding. Verdicts:
--   EXPOSED  PUBLIC, anon or authenticated holds something they should not
--   REVIEW   another role holds something that needs a judgement call
--   RECORD   a fact the remediation needs (owner, setting, definition)
--   INFO     context
--   PASS     the thing that should not be there is not there
-- Row 999 counts the EXPOSED findings.
-- =============================================================================
BEGIN TRANSACTION READ ONLY;

WITH
-- The roles named in the security hold, plus every role that can log in.
named_roles (rolname, note) AS (VALUES
  ('public', 'the PUBLIC pseudo-role: every role inherits it'),
  ('anon', 'PostgREST, before sign-in'),
  ('authenticated', 'PostgREST, after sign-in'),
  ('service_role', 'PostgREST, service key'),
  ('authenticator', 'the role PostgREST logs in as'),
  ('postgres', 'the SQL editor and migrations'),
  ('supabase_admin', 'platform'),
  ('supabase_functions_admin', 'Database Webhooks'),
  ('sapelee_growth_reader', 'the reporting login')
),
roles_named AS (
  SELECT n.rolname, n.note, true AS is_named,
    coalesce((SELECT r.rolcanlogin FROM pg_roles r WHERE r.rolname = n.rolname), false) AS can_login
  FROM named_roles n
  WHERE n.rolname = 'public' OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = n.rolname)
),
roles_login AS (
  SELECT r.rolname::text AS rolname, 'login role'::text AS note, false AS is_named, true AS can_login
  FROM pg_roles r
  WHERE r.rolcanlogin AND r.rolname NOT IN (SELECT rolname FROM roles_named)
),
roles AS (
  SELECT * FROM roles_named UNION ALL SELECT * FROM roles_login
),

-- pg_net's objects.
net_ns AS (SELECT n.oid, n.nspname, n.nspowner::regrole::text AS owner, n.nspacl FROM pg_namespace n WHERE n.nspname = 'net'),
net_rel (obj, oid) AS (VALUES
  ('net.http_request_queue', to_regclass('net.http_request_queue')),
  ('net._http_response', to_regclass('net._http_response'))
),
net_col (obj, col) AS (VALUES
  ('net.http_request_queue', 'headers'), ('net.http_request_queue', 'body'),
  ('net._http_response', 'headers'), ('net._http_response', 'content')
),
req_seq AS (
  SELECT CASE WHEN to_regclass('net.http_request_queue') IS NULL THEN NULL
              ELSE pg_get_serial_sequence('net.http_request_queue', 'id') END AS seqname
),
req_seq_rel AS (SELECT to_regclass(rs.seqname) AS oid, rs.seqname FROM req_seq rs),
net_fn AS (
  SELECT p.oid, p.proname, p.prosecdef, l.lanname, p.proowner::regrole::text AS owner,
    pg_get_function_identity_arguments(p.oid) AS args,
    coalesce(p.proacl::text, '(default: PUBLIC EXECUTE)') AS acl,
    p.proname IN ('http_get', 'http_post', 'http_delete', 'http_collect_response', '_http_collect_response',
                  'worker_restart', 'wait_until_running', 'wake', 'check_worker_is_up') AS control
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'net' AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
),
outside_fn AS (
  -- A function returning trigger or event_trigger cannot be called directly
  -- ("trigger functions can only be called as triggers"), so holding EXECUTE on
  -- one is not a way in, whatever the ACL says.
  SELECT p.oid, n.nspname || '.' || p.proname AS fname, p.prosecdef,
    p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype) AS not_callable
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname NOT IN ('net', 'pg_catalog', 'information_schema')
    AND l.lanname IN ('sql', 'plpgsql')
    AND p.prosrc ~* 'http_request_queue|_http_response|net\.http_'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
),

-- The effective privilege matrix, one row per role.
matrix AS (
  SELECT r.rolname, r.note, r.is_named, r.can_login,
    CASE WHEN EXISTS (SELECT 1 FROM net_ns) THEN
      nullif(concat_ws(',',
        CASE WHEN has_schema_privilege(r.rolname, 'net', 'USAGE') THEN 'USAGE' END,
        CASE WHEN has_schema_privilege(r.rolname, 'net', 'CREATE') THEN 'CREATE' END), '')
    END AS schema_priv,
    (SELECT string_agg(x.obj || '=' || x.held, '; ' ORDER BY x.obj) FROM (
      SELECT nr.obj, string_agg(t.priv, ',' ORDER BY t.priv) AS held
      FROM net_rel nr CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) t (priv)
      WHERE nr.oid IS NOT NULL AND has_table_privilege(r.rolname, nr.oid, t.priv)
      GROUP BY nr.obj) x) AS table_priv,
    (SELECT string_agg(y.obj || '.' || y.col, ', ' ORDER BY y.obj, y.col) FROM (
      SELECT nc.obj, nc.col FROM net_col nc JOIN net_rel nr ON nr.obj = nc.obj
      WHERE nr.oid IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = nr.oid AND a.attname = nc.col AND NOT a.attisdropped)
        AND has_column_privilege(r.rolname, nr.oid, nc.col, 'SELECT')) y) AS secret_columns,
    (SELECT nullif(string_agg(sp.priv, ',' ORDER BY sp.priv), '')
       FROM req_seq_rel s CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) sp (priv)
      WHERE s.oid IS NOT NULL AND has_sequence_privilege(r.rolname, s.oid, sp.priv)) AS sequence_priv,
    (SELECT string_agg(f.proname, ', ' ORDER BY f.proname)
       FROM net_fn f WHERE f.control AND has_function_privilege(r.rolname, f.oid, 'EXECUTE')) AS control_functions,
    (SELECT string_agg(f.proname, ', ' ORDER BY f.proname)
       FROM net_fn f WHERE NOT f.control AND has_function_privilege(r.rolname, f.oid, 'EXECUTE')) AS other_net_functions,
    (SELECT string_agg(f.fname, ', ' ORDER BY f.fname)
       FROM outside_fn f WHERE NOT f.not_callable AND has_function_privilege(r.rolname, f.oid, 'EXECUTE')) AS outside_functions
  FROM roles r
),
matrix_any AS (
  SELECT m.*, (m.schema_priv IS NOT NULL OR m.table_priv IS NOT NULL OR m.sequence_priv IS NOT NULL
    OR m.control_functions IS NOT NULL OR m.other_net_functions IS NOT NULL OR m.outside_functions IS NOT NULL) AS holds_anything
  FROM matrix m
),

-- extensions.grant_pg_net_access, and what re-applies it.
granter AS (
  SELECT p.oid, n.nspname || '.' || p.proname AS fname, p.proowner::regrole::text AS owner,
    p.prosecdef, array_to_string(p.proconfig, ', ') AS config, md5(p.prosrc) AS src_md5,
    p.prosrc ~* 'secret|password|token|vault|decrypted|apikey|api_key|authorization' AS looks_sensitive,
    p.prosrc AS src,
    (length(p.prosrc) - length(replace(p.prosrc, chr(10), ''))) + 1 AS src_lines
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'grant_pg_net_access'
),
granter_events AS (
  SELECT e.evtname, e.evtevent, e.evtenabled::text AS enabled, e.evtowner::regrole::text AS owner,
    coalesce(array_to_string(e.evttags, ','), '(all tags)') AS tags,
    n.nspname || '.' || p.proname AS fname
  FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid JOIN pg_namespace n ON n.oid = p.pronamespace
),

-- The worker's own requirements.
net_settings AS (
  SELECT string_agg(s.name || '=' || coalesce(s.setting, '(null)') || ' [' || s.source || ']', '; ' ORDER BY s.name) AS txt
  FROM pg_settings s WHERE s.name LIKE 'pg\_net.%'
),
worker_backends AS (
  SELECT string_agg(a.backend_type || ' as ' || coalesce(a.usename::text, '(none)') || ' on ' || coalesce(a.datname::text, '(none)')
           || ' since ' || to_char(a.backend_start AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), '; ' ORDER BY a.backend_start) AS txt
  FROM pg_stat_activity a
  WHERE a.backend_type ILIKE '%pg_net%' OR a.application_name ILIKE '%pg_net%'
),

-- Default privileges that could recreate access on the next object created.
defacl AS (
  SELECT coalesce(n.nspname, '(any schema)') AS schema_name, d.defaclrole::regrole::text AS grantor,
    CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences' WHEN 'f' THEN 'functions'
         WHEN 'T' THEN 'types' WHEN 'n' THEN 'schemas' ELSE d.defaclobjtype::text END AS obj_type,
    d.defaclacl::text AS acl,
    n.nspname IS NOT DISTINCT FROM 'net' AS in_net,
    d.defaclacl::text ~ '(^|,)=|"=|anon=|authenticated=' AS grants_broadly
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
),

-- Credentials: which roles can log in at all, and (only if readable) which have a password set.
can_read_authid AS (SELECT has_table_privilege(current_user, 'pg_catalog.pg_authid', 'SELECT') AS yes),
login_roles AS (
  SELECT r.rolname::text AS rolname, r.rolsuper, r.rolbypassrls, r.rolvaliduntil,
    coalesce((SELECT string_agg(m.roleid::regrole::text, ',' ORDER BY m.roleid::regrole::text)
                FROM pg_auth_members m WHERE m.member = r.oid), '(none)') AS member_of,
    CASE WHEN (SELECT yes FROM can_read_authid)
         THEN (SELECT CASE WHEN a.rolpassword IS NULL THEN 'no password' ELSE 'password set' END
                 FROM pg_authid a WHERE a.oid = r.oid)
         ELSE 'not readable (needs pg_authid)' END AS credential
  FROM pg_roles r WHERE r.rolcanlogin
),

checks (ord, section, finding, expected, actual, verdict) AS (
  -- A. environment and ownership
  SELECT 10, 'A pg_net', 'extension installed, version, schema', '(record)',
    coalesce((SELECT 'pg_net ' || e.extversion || ' owned by ' || e.extowner::regrole::text
                || ', extension schema ' || coalesce(n.nspname, '(none)')
              FROM pg_extension e LEFT JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_net'),
             'not installed'),
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN 'RECORD' ELSE 'INFO' END
  UNION ALL
  SELECT 11, 'A pg_net', 'schema net: owner and raw ACL', '(record)',
    coalesce((SELECT 'owner ' || owner || ', acl ' || coalesce(nspacl::text, '(default: owner only)') FROM net_ns), 'schema net does not exist'),
    CASE WHEN EXISTS (SELECT 1 FROM net_ns) THEN 'RECORD' ELSE 'INFO' END
  UNION ALL
  SELECT 12 + (nr.obj = 'net._http_response')::int, 'A pg_net', nr.obj || ': owner, RLS and raw ACL', '(record)',
    coalesce((SELECT 'owner ' || c.relowner::regrole::text
                || ', rls ' || c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
                || ', acl ' || coalesce(c.relacl::text, '(default: owner only)')
              FROM pg_class c WHERE c.oid = nr.oid), 'missing'),
    CASE WHEN nr.oid IS NULL THEN 'INFO' ELSE 'RECORD' END
  FROM net_rel nr
  UNION ALL
  SELECT 14, 'A pg_net', 'request-id sequence: name, owner and raw ACL', '(record)',
    coalesce((SELECT coalesce(s.seqname, '(none)') || ': owner ' || coalesce(c.relowner::regrole::text, '-')
                || ', acl ' || coalesce(c.relacl::text, '(default: owner only)')
              FROM req_seq_rel s LEFT JOIN pg_class c ON c.oid = s.oid), 'not found'),
    CASE WHEN (SELECT oid FROM req_seq_rel) IS NULL THEN 'INFO' ELSE 'RECORD' END
  UNION ALL
  SELECT 15, 'A pg_net', 'net functions: name, owner, security, raw ACL', '(record)',
    coalesce((SELECT string_agg(f.proname || '(' || f.args || ') owner ' || f.owner
                || CASE WHEN f.prosecdef THEN ' SECURITY DEFINER' ELSE '' END
                || ' acl ' || f.acl,
                E'\n' ORDER BY f.proname, f.args) FROM net_fn f), '(none)'),
    'RECORD'
  UNION ALL
  SELECT 16, 'A pg_net', 'public.notify_push_on_alert: owner, security, search_path, definitions', '1 definition',
    coalesce((SELECT string_agg(p.proowner::regrole::text
                || CASE WHEN p.prosecdef THEN ' SECURITY DEFINER' ELSE ' SECURITY INVOKER' END
                || ' config ' || coalesce(array_to_string(p.proconfig, ','), '(none)')
                || ' acl ' || coalesce(p.proacl::text, '(default: PUBLIC EXECUTE)'), '; ')
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'notify_push_on_alert'), 'missing'),
    CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'notify_push_on_alert') = 1 THEN 'RECORD' ELSE 'REVIEW' END

  -- B. the privilege matrix
  UNION ALL
  SELECT 20, 'B privileges', 'roles audited', '(record)',
    (SELECT count(*)::text || ' roles: ' || string_agg(rolname, ', ' ORDER BY rolname) FROM roles), 'INFO'
  UNION ALL
  SELECT CASE WHEN m.rolname = 'public' THEN 21 WHEN m.rolname = 'anon' THEN 22 WHEN m.rolname = 'authenticated' THEN 23 ELSE 24 END,
    'B privileges', 'role ' || m.rolname || ' (' || m.note || ')', 'no pg_net access',
    'schema=' || coalesce(m.schema_priv, '-')
      || ' | tables=' || coalesce(m.table_priv, '-')
      || ' | secret-bearing columns readable=' || coalesce(m.secret_columns, '-')
      || ' | sequence=' || coalesce(m.sequence_priv, '-')
      || ' | request/response/worker functions=' || coalesce(m.control_functions, '-')
      || ' | other net functions=' || coalesce(m.other_net_functions, '-')
      || ' | functions outside net=' || coalesce(m.outside_functions, '-'),
    CASE WHEN NOT m.holds_anything THEN 'PASS'
         WHEN m.rolname IN ('public', 'anon', 'authenticated') THEN 'EXPOSED'
         ELSE 'REVIEW' END
  FROM matrix_any m
  WHERE m.holds_anything OR m.is_named

  -- C. what re-grants it
  UNION ALL
  SELECT 30, 'C re-grant', 'extensions.grant_pg_net_access exists', '(record)',
    coalesce((SELECT string_agg(g.fname || ' owner ' || g.owner
                || CASE WHEN g.prosecdef THEN ' SECURITY DEFINER' ELSE ' SECURITY INVOKER' END
                || ' config ' || coalesce(nullif(g.config, ''), '(none)')
                || ' md5 ' || g.src_md5 || ' (' || g.src_lines || ' lines)', '; ') FROM granter g), 'not present'),
    CASE WHEN EXISTS (SELECT 1 FROM granter) THEN 'RECORD' ELSE 'INFO' END
  UNION ALL
  SELECT 31, 'C re-grant', 'event triggers that run it, and when', 'none, or listed exactly',
    coalesce((SELECT string_agg(ge.evtname || ' on ' || ge.evtevent || ' tags ' || ge.tags
                || ' enabled ' || ge.enabled || ' owner ' || ge.owner || ' -> ' || ge.fname, '; ' ORDER BY ge.evtname)
              FROM granter_events ge WHERE ge.fname LIKE '%grant_pg_net_access%'), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM granter_events ge WHERE ge.fname LIKE '%grant_pg_net_access%') THEN 'REVIEW' ELSE 'PASS' END
  UNION ALL
  SELECT 32, 'C re-grant', 'every other event trigger (any of these can re-apply grants)', '(record)',
    coalesce((SELECT string_agg(ge.evtname || ' on ' || ge.evtevent || ' tags ' || ge.tags
                || ' enabled ' || ge.enabled || ' -> ' || ge.fname, '; ' ORDER BY ge.evtname)
              FROM granter_events ge WHERE ge.fname NOT LIKE '%grant_pg_net_access%'), '(none)'),
    'RECORD'
  UNION ALL
  SELECT 33, 'C re-grant', 'source of grant_pg_net_access (printed only when it carries no secret-shaped text)', '(record)',
    coalesce((SELECT CASE WHEN g.looks_sensitive
                          THEN 'WITHHELD: source matches a secret-shaped pattern; md5 ' || g.src_md5
                          ELSE g.src END FROM granter g LIMIT 1), 'not present'),
    CASE WHEN EXISTS (SELECT 1 FROM granter WHERE looks_sensitive) THEN 'REVIEW' ELSE 'RECORD' END

  -- D. what the worker needs
  UNION ALL
  SELECT 40, 'D worker', 'pg_net settings (pg_net.username names the role the worker connects as)', '(record)',
    coalesce((SELECT nullif(txt, '') FROM net_settings), '(no pg_net.* settings visible)'), 'RECORD'
  UNION ALL
  SELECT 41, 'D worker', 'pg_net background worker backends, by role and database', '(record)',
    coalesce((SELECT nullif(txt, '') FROM worker_backends), '(none visible right now)'), 'RECORD'
  UNION ALL
  -- From the statistics collector, so this audit never reads a row of either
  -- table: live rows now, and how many have ever been written and removed.
  SELECT 42, 'D worker', 'queue and response traffic (approximate: catalog statistics, not row reads)', '(record)',
    coalesce((SELECT string_agg(s.relname || ': live ' || s.n_live_tup || ', inserted ' || s.n_tup_ins
                || ', deleted ' || s.n_tup_del, '; ' ORDER BY s.relname)
              FROM pg_stat_all_tables s WHERE s.schemaname = 'net'), '(no pg_net tables)'),
    'RECORD'

  -- E. default privileges. Only schema net can recreate the pg_net exposure;
  -- broad defaults elsewhere are a separate question, reported separately.
  UNION ALL
  SELECT 50, 'E default privileges', 'default ACLs in schema net that would grant access on new objects', '(none)',
    coalesce((SELECT string_agg(d.obj_type || ' by ' || d.grantor || ': ' || d.acl, '; '
                ORDER BY d.obj_type, d.grantor) FROM defacl d WHERE d.in_net), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM defacl WHERE in_net AND grants_broadly) THEN 'EXPOSED'
         WHEN EXISTS (SELECT 1 FROM defacl WHERE in_net) THEN 'REVIEW' ELSE 'PASS' END
  UNION ALL
  SELECT 51, 'E default privileges', 'default ACLs in OTHER schemas granting to PUBLIC, anon or authenticated (separate issue)', '(record)',
    coalesce((SELECT string_agg(d.schema_name || ' ' || d.obj_type || ' by ' || d.grantor || ': ' || d.acl, '; '
                ORDER BY d.schema_name, d.obj_type, d.grantor) FROM defacl d WHERE NOT d.in_net AND d.grants_broadly), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM defacl WHERE NOT in_net AND grants_broadly) THEN 'REVIEW' ELSE 'PASS' END
  UNION ALL
  SELECT 52, 'E default privileges', 'every other default ACL', '(record)',
    coalesce((SELECT string_agg(d.schema_name || ' ' || d.obj_type || ' by ' || d.grantor || ': ' || d.acl, '; '
                ORDER BY d.schema_name, d.obj_type, d.grantor) FROM defacl d WHERE NOT d.in_net AND NOT d.grants_broadly), '(none)'),
    'INFO'

  -- F. credentials
  UNION ALL
  SELECT 60, 'F credentials', 'roles that can log in (every one of them inherits PUBLIC)', '(record)',
    coalesce((SELECT string_agg(l.rolname
                || CASE WHEN l.rolsuper THEN ' SUPERUSER' ELSE '' END
                || CASE WHEN l.rolbypassrls THEN ' BYPASSRLS' ELSE '' END
                || ' [' || l.credential || ']'
                || CASE WHEN l.rolvaliduntil IS NULL THEN '' ELSE ' until ' || to_char(l.rolvaliduntil AT TIME ZONE 'UTC', 'YYYY-MM-DD') END
                || ' member of ' || l.member_of, E'\n' ORDER BY l.rolname) FROM login_roles l), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM login_roles) THEN 'REVIEW' ELSE 'PASS' END
  UNION ALL
  SELECT 61, 'F credentials', 'login roles whose password is set and which still hold pg_net access', 'none',
    coalesce((SELECT string_agg(m.rolname, ', ' ORDER BY m.rolname)
              FROM matrix_any m JOIN login_roles l ON l.rolname = m.rolname
              WHERE m.holds_anything AND m.rolname NOT IN ('postgres', 'supabase_admin')), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM matrix_any m JOIN login_roles l ON l.rolname = m.rolname
                      WHERE m.holds_anything AND m.rolname NOT IN ('postgres', 'supabase_admin')) THEN 'EXPOSED' ELSE 'PASS' END
)
SELECT ord, section, finding, expected, actual, verdict FROM checks
UNION ALL
SELECT 999, 'VERDICT', 'exposures found', '0 EXPOSED',
  (SELECT count(*) FROM checks WHERE verdict = 'EXPOSED')::text || ' EXPOSED, '
    || (SELECT count(*) FROM checks WHERE verdict = 'REVIEW')::text || ' REVIEW',
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'EXPOSED') THEN 'EXPOSED' ELSE 'PASS' END
ORDER BY ord;

ROLLBACK;
