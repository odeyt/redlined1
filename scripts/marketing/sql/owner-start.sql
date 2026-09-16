-- =============================================================================
-- OWNER START SQL - marketing capture, alert and push gates (correlation Option A)
-- =============================================================================
-- READ ONLY. Run in the Supabase SQL Editor, as postgres, IMMEDIATELY before
-- `npm run capture:marketing`. It changes nothing: one read-only transaction,
-- rolled back. It reads no queued request headers or bodies (the queue's
-- headers carry the push secret) and prints no function source.
--
-- Edit exactly one thing: replace __DEMO_SHOP_ID__ below with the demo shop id
-- (lowercase UUID). The SHA-256 pinned in the repository is of this file
-- before that edit.
--
-- One row per check. Verdicts: PASS, STOP, REVIEW (also stops), INFO, RECORD.
-- The capture may start only when row 999 reads CAPTURE MAY START.
-- Copy row 900, the START TOKEN, exactly: OWNER FINISH SQL needs it.
-- =============================================================================
BEGIN TRANSACTION READ ONLY;

WITH
params AS (
  SELECT '__DEMO_SHOP_ID__'::text AS shop_text
),
p AS (
  SELECT
    shop_text,
    shop_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AS shop_ok,
    CASE WHEN shop_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN shop_text::uuid END AS shop_id,
    now() AS t0
  FROM params
),

-- ---------------------------------------------------------------------------
-- A. The demo shop is isolated
-- ---------------------------------------------------------------------------
shop AS (
  SELECT s.id, s.name, s.is_synthetic, s.organization_id
  FROM public.shops s JOIN p ON s.id = p.shop_id
),
members AS (
  SELECT su.user_id, su.role FROM public.shop_users su JOIN p ON su.shop_id = p.shop_id
),
alert_pairs (role_key, event_id) AS (VALUES
  ('owner', 'ro.status_changed'), ('manager', 'ro.status_changed'), ('advisor', 'ro.status_changed'), ('technician', 'ro.status_changed'),
  ('owner', 'ro.pending_approval'), ('manager', 'ro.pending_approval'), ('advisor', 'ro.pending_approval'),
  ('technician', 'job.assigned'),
  ('technician', 'job.work_added'),
  ('owner', 'inspection.completed'), ('manager', 'inspection.completed'), ('advisor', 'inspection.completed'),
  ('owner', 'estimate.approved'), ('manager', 'estimate.approved'), ('advisor', 'estimate.approved'),
  ('owner', 'parts.received'), ('manager', 'parts.received'), ('advisor', 'parts.received'), ('technician', 'parts.received'),
  ('owner', 'invoice.paid'), ('manager', 'invoice.paid')
),
settings AS (
  SELECT ss.alert_preferences FROM public.shop_settings ss JOIN p ON ss.shop_id = p.shop_id
),
muted AS (
  SELECT count(*) FILTER (
    WHERE (SELECT count(*) FROM settings) = 1
      AND jsonb_typeof((SELECT alert_preferences FROM settings LIMIT 1) -> ap.role_key) = 'array'
      AND ((SELECT alert_preferences FROM settings LIMIT 1) -> ap.role_key) ? ap.event_id
  ) AS n_muted,
  count(*) AS n_pairs
  FROM alert_pairs ap
),

-- ---------------------------------------------------------------------------
-- B. pg_net privileges for PUBLIC, anon and authenticated (a browser session
--    is anon before sign-in and authenticated after)
-- ---------------------------------------------------------------------------
who (label, rolname) AS (VALUES
  ('PUBLIC', 'public'::text), ('anon', 'anon'::text), ('authenticated', 'authenticated'::text)
),
who_ok AS (
  SELECT w.label, w.rolname FROM who w
  WHERE w.rolname = 'public' OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = w.rolname)
),
net_ns AS (
  SELECT n.oid FROM pg_namespace n WHERE n.nspname = 'net'
),
ns_priv AS (
  SELECT w.label,
    EXISTS (SELECT 1 FROM net_ns) AND has_schema_privilege(w.rolname, 'net', 'USAGE') AS has_usage,
    EXISTS (SELECT 1 FROM net_ns) AND has_schema_privilege(w.rolname, 'net', 'CREATE') AS has_create
  FROM who_ok w
),
net_rel (obj, oid) AS (VALUES
  ('net.http_request_queue', to_regclass('net.http_request_queue')),
  ('net._http_response', to_regclass('net._http_response'))
),
tpriv (priv) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
rel_priv AS (
  SELECT r.obj, w.label,
    string_agg(t.priv, ',' ORDER BY t.priv) FILTER (WHERE has_table_privilege(w.rolname, r.oid, t.priv)) AS held
  FROM net_rel r CROSS JOIN who_ok w CROSS JOIN tpriv t
  WHERE r.oid IS NOT NULL
  GROUP BY r.obj, w.label
),
net_col (obj, oid, col) AS (VALUES
  ('net.http_request_queue', to_regclass('net.http_request_queue'), 'headers'),
  ('net.http_request_queue', to_regclass('net.http_request_queue'), 'body'),
  ('net._http_response', to_regclass('net._http_response'), 'headers'),
  ('net._http_response', to_regclass('net._http_response'), 'content')
),
col_priv AS (
  SELECT c.obj, w.label,
    string_agg(c.col, ',' ORDER BY c.col) FILTER (WHERE has_column_privilege(w.rolname, c.oid, c.col, 'SELECT')) AS cols
  FROM net_col c CROSS JOIN who_ok w
  WHERE c.oid IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = c.col AND NOT a.attisdropped)
  GROUP BY c.obj, w.label
),
req_seq AS (
  SELECT CASE WHEN to_regclass('net.http_request_queue') IS NULL THEN NULL
              ELSE pg_get_serial_sequence('net.http_request_queue', 'id') END AS seqname
),
req_seq_rel AS (
  SELECT to_regclass(rs.seqname) AS oid, rs.seqname FROM req_seq rs
),
seq_priv AS (
  SELECT w.label,
    string_agg(sp.priv, ',' ORDER BY sp.priv) FILTER (WHERE has_sequence_privilege(w.rolname, s.oid, sp.priv)) AS held
  FROM req_seq_rel s CROSS JOIN who_ok w CROSS JOIN (VALUES ('SELECT'), ('UPDATE'), ('USAGE')) sp (priv)
  WHERE s.oid IS NOT NULL
  GROUP BY w.label
),
fn AS (
  SELECT pr.oid, n.nspname, pr.proname, pr.prosrc, l.lanname,
    pr.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype) AS is_trigger,
    EXISTS (SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass AND d.objid = pr.oid AND d.deptype = 'e') AS ext_member
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  JOIN pg_language l ON l.oid = pr.prolang
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
),
net_fn_exec AS (
  SELECT f.proname, w.label,
    f.proname IN ('http_get', 'http_post', 'http_delete', 'http_collect_response', '_http_collect_response',
                  'worker_restart', 'wait_until_running', 'wake')
      OR (f.lanname IN ('sql', 'plpgsql') AND f.prosrc ~* 'http_request_queue|_http_response') AS touches_pg_net
  FROM fn f CROSS JOIN who_ok w
  WHERE f.nspname = 'net' AND NOT f.is_trigger AND has_function_privilege(w.rolname, f.oid, 'EXECUTE')
),
outside_fn_exec AS (
  SELECT f.nspname || '.' || f.proname AS fname, w.label
  FROM fn f CROSS JOIN who_ok w
  WHERE f.nspname <> 'net' AND NOT f.ext_member AND NOT f.is_trigger
    AND f.prosrc ~* 'http_request_queue|_http_response'
    AND has_function_privilege(w.rolname, f.oid, 'EXECUTE')
),

-- ---------------------------------------------------------------------------
-- C. One HTTP caller, and the live definitions that decide the alert count
-- ---------------------------------------------------------------------------
http_callers AS (
  SELECT f.nspname || '.' || f.proname AS fname
  FROM fn f
  WHERE f.nspname <> 'net' AND NOT f.ext_member
    AND NOT (f.nspname = 'supabase_functions' AND f.proname = 'http_request')
    AND f.prosrc ~* 'net\.http_|http_request_queue|_http_response|supabase_functions\.http_request|\mhttp_(get|post|put|patch|delete|head)\M'
),
push_fn AS (
  SELECT f.prosrc FROM fn f WHERE f.nspname = 'public' AND f.proname = 'notify_push_on_alert'
),
webhook_triggers AS (
  SELECT count(*) AS n
  FROM pg_trigger t JOIN pg_proc pr ON pr.oid = t.tgfoid JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'supabase_functions' AND NOT t.tgisinternal
),
trig AS (
  SELECT c.relname, t.tgname,
    c.relname || '.' || t.tgname || ' ' || t.tgenabled::text || ' '
      || CASE WHEN t.tgtype & 2 <> 0 THEN 'BEFORE' WHEN t.tgtype & 64 <> 0 THEN 'INSTEAD' ELSE 'AFTER' END || ' '
      || concat_ws(' OR ',
           CASE WHEN t.tgtype & 4 <> 0 THEN 'INSERT' END,
           CASE WHEN t.tgtype & 16 <> 0 THEN 'UPDATE' END,
           CASE WHEN t.tgtype & 8 <> 0 THEN 'DELETE' END,
           CASE WHEN t.tgtype & 32 <> 0 THEN 'TRUNCATE' END) || ' '
      || CASE WHEN t.tgtype & 1 <> 0 THEN 'ROW' ELSE 'STATEMENT' END || ' '
      || fn_ns.nspname || '.' || pr.proname
      || CASE WHEN t.tgqual IS NOT NULL THEN ' WHEN' ELSE '' END
      || CASE WHEN t.tgattr::text <> '' THEN ' OF-COLUMNS' ELSE '' END AS descr
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace cn ON cn.oid = c.relnamespace
  JOIN pg_proc pr ON pr.oid = t.tgfoid
  JOIN pg_namespace fn_ns ON fn_ns.oid = pr.pronamespace
  WHERE cn.nspname = 'public' AND NOT t.tgisinternal
    AND c.relname IN ('alert_events', 'audit_events', 'job_cards', 'repair_orders', 'ro_status_events', 'standard_labor_guides')
),
trig_pin AS (
  SELECT
    'alert_events.alert_events_push O AFTER INSERT ROW public.notify_push_on_alert; '
    || 'audit_events.audit_events_no_update O BEFORE UPDATE OR DELETE ROW public.audit_events_are_append_only; '
    || 'job_cards.job_cards_alert_assigned O AFTER UPDATE ROW public.alert_job_assigned; '
    || 'job_cards.job_cards_alert_work_added O AFTER UPDATE ROW public.alert_job_work_added; '
    || 'job_cards.trg_free_tier_limit O BEFORE INSERT ROW public.enforce_free_tier_count_limit; '
    || 'repair_orders.repair_orders_alert_pending_approval O AFTER UPDATE ROW public.alert_ro_pending_approval; '
    || 'repair_orders.repair_orders_alert_status_changed O AFTER UPDATE ROW public.alert_ro_status_changed; '
    || 'repair_orders.repair_orders_status_change O AFTER UPDATE ROW public.record_ro_status_change' AS expected,
    coalesce((SELECT string_agg(descr, '; ' ORDER BY relname COLLATE "C", tgname COLLATE "C") FROM trig), '(none)') AS actual
),
fn_pin (ord, fname, exact_md5, normalized_md5) AS (VALUES
  (55, 'alert_ro_status_changed', 'f5ada9b8f4ea481a8c809bcea94171ba', '131af272466ac2d370bbb0ccd83a089a'),
  (56, 'alert_ro_pending_approval', 'e7005a0910cb37bb0444a7515030472a', '64d2a3a9ad137fc1ee48daf8c4107674'),
  (57, 'emit_alert_event', '7ca2ecc78830f45619d5738410ae661b', '8fd2dbfabe529f640aedc1d79a9fd0bf'),
  (58, 'record_ro_status_change', 'b4ae5ee9174d62d41e3d9ef78cb4249f', '4d46681b324bd342f4b7a0d99217f4e7'),
  (59, 'alert_job_assigned', 'ad16d7dc2e0e27e485cf6a7ac057c722', 'a5c677036225a521fc3067504441a34f'),
  (60, 'alert_job_work_added', '010c9883b74b759a08cef5ac6ef272a8', '2987c8c85f44f7b477b2b681505f1914')
),
fn_live AS (
  SELECT fp.ord, fp.fname, fp.exact_md5, fp.normalized_md5,
    (SELECT count(*) FROM fn f WHERE f.nspname = 'public' AND f.proname = fp.fname) AS n_defs,
    (SELECT md5(f.prosrc) FROM fn f WHERE f.nspname = 'public' AND f.proname = fp.fname LIMIT 1) AS live_exact,
    (SELECT md5(btrim(regexp_replace(f.prosrc, '[ \t\n\r\f\v]+', ' ', 'g'))) FROM fn f
      WHERE f.nspname = 'public' AND f.proname = fp.fname LIMIT 1) AS live_normalized
  FROM fn_pin fp
),
fn_verdict AS (
  SELECT fl.*,
    CASE WHEN fl.n_defs = 1 AND fl.live_exact = fl.exact_md5 THEN 'PASS'
         WHEN fl.n_defs = 1 AND fl.live_normalized = fl.normalized_md5 THEN 'REVIEW'
         ELSE 'STOP' END AS verdict
  FROM fn_live fl
),

-- ---------------------------------------------------------------------------
-- D. Baselines for OWNER FINISH SQL
-- ---------------------------------------------------------------------------
req_seq_state AS (
  SELECT s.last_value, s.start_value, s.increment_by, s.cache_size
  FROM pg_sequences s JOIN req_seq_rel r ON r.oid IS NOT NULL
   AND (quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename))::regclass = r.oid
),
inv_seq AS (
  SELECT s.last_value FROM pg_sequences s WHERE s.schemaname = 'public' AND s.sequencename = 'invoice_number_seq'
),
base AS (
  SELECT
    (SELECT count(*) FROM public.alert_events) AS c0,
    (SELECT coalesce(last_value, start_value - increment_by) FROM req_seq_state) AS s0,
    (SELECT CASE WHEN last_value IS NULL THEN 'none' ELSE last_value::text END FROM inv_seq) AS i0,
    (SELECT md5(prosrc) FROM push_fn) AS np,
    to_char(p.t0 AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t0_text
  FROM p
),
token AS (
  SELECT b.*,
    'RL1S;SHOP=' || p.shop_text || ';S0=' || coalesce(b.s0::text, 'missing') || ';C0=' || b.c0
      || ';T0=' || b.t0_text || ';I0=' || coalesce(b.i0, 'missing') || ';NP=' || coalesce(b.np, 'missing') AS payload
  FROM base b CROSS JOIN p
),

checks (ord, section, check_name, expected, actual, verdict) AS (
  -- A
  SELECT 10, 'A isolation', 'demo shop id parameter is a lowercase UUID', 'yes',
    CASE WHEN p.shop_ok THEN 'yes' ELSE 'no: replace __DEMO_SHOP_ID__' END,
    CASE WHEN p.shop_ok THEN 'PASS' ELSE 'STOP' END FROM p
  UNION ALL
  SELECT 11, 'A isolation', 'demo shop exists, is_synthetic, named Redlined1 Demo Workshop', '1, true, true',
    (SELECT count(*) FROM shop)::text || ', ' || coalesce((SELECT is_synthetic::text FROM shop LIMIT 1), '-')
      || ', ' || coalesce((SELECT (name = 'Redlined1 Demo Workshop')::text FROM shop LIMIT 1), '-'),
    CASE WHEN (SELECT count(*) FROM shop) = 1 AND (SELECT is_synthetic IS TRUE AND name = 'Redlined1 Demo Workshop' FROM shop)
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 12, 'A isolation', 'demo shop members', '1 (owner)',
    (SELECT count(*) FROM members)::text || ' (' || coalesce((SELECT string_agg(role, ',' ORDER BY role) FROM members), '') || ')',
    CASE WHEN (SELECT count(*) FROM members) = 1 AND (SELECT role FROM members LIMIT 1) = 'owner' THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 13, 'A isolation', 'memberships the demo member holds in other shops', '0',
    (SELECT count(*) FROM public.shop_users su, p WHERE su.user_id IN (SELECT user_id FROM members) AND su.shop_id <> p.shop_id)::text,
    CASE WHEN (SELECT count(*) FROM members) = 1
          AND (SELECT count(*) FROM public.shop_users su, p WHERE su.user_id IN (SELECT user_id FROM members) AND su.shop_id <> p.shop_id) = 0
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 14, 'A isolation', 'push subscriptions: by the demo member, by the demo shop', '0, 0',
    (SELECT count(*) FROM public.push_subscriptions ps WHERE ps.user_id IN (SELECT user_id FROM members))::text || ', '
      || (SELECT count(*) FROM public.push_subscriptions ps, p WHERE ps.shop_id = p.shop_id)::text,
    CASE WHEN (SELECT count(*) FROM public.push_subscriptions ps WHERE ps.user_id IN (SELECT user_id FROM members)) = 0
          AND (SELECT count(*) FROM public.push_subscriptions ps, p WHERE ps.shop_id = p.shop_id) = 0
          AND (SELECT count(*) FROM members) = 1
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 15, 'A isolation', 'shop_settings rows for the demo shop', '1',
    (SELECT count(*) FROM settings)::text,
    CASE WHEN (SELECT count(*) FROM settings) = 1 THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 16, 'A isolation', 'alert preferences mute every catalogue alert for every receiving role', '21 of 21',
    (SELECT n_muted || ' of ' || n_pairs FROM muted),
    CASE WHEN (SELECT n_muted = 21 AND n_pairs = 21 FROM muted) THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 17, 'A isolation', 'demo-shop customers with a phone or email', '0',
    (SELECT count(*) FROM public.customers c, p WHERE c.shop_id = p.shop_id
       AND (coalesce(btrim(c.phone), '') <> '' OR coalesce(btrim(c.email), '') <> ''))::text,
    CASE WHEN (SELECT count(*) FROM public.customers c, p WHERE c.shop_id = p.shop_id
       AND (coalesce(btrim(c.phone), '') <> '' OR coalesce(btrim(c.email), '') <> '')) = 0 THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 18, 'A isolation', 'demo-shop technicians with a phone, email or login', '0',
    (SELECT count(*) FROM public.technicians t, p WHERE t.shop_id = p.shop_id
       AND (coalesce(btrim(t.phone), '') <> '' OR coalesce(btrim(t.email), '') <> '' OR t.user_id IS NOT NULL))::text,
    CASE WHEN (SELECT count(*) FROM public.technicians t, p WHERE t.shop_id = p.shop_id
       AND (coalesce(btrim(t.phone), '') <> '' OR coalesce(btrim(t.email), '') <> '' OR t.user_id IS NOT NULL)) = 0 THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 19, 'A isolation', 'Sapelee outbox rows for the demo shop', '0',
    (SELECT count(*) FROM public.sapelee_event_outbox o, p WHERE o.shop_id = p.shop_id)::text,
    CASE WHEN (SELECT count(*) FROM public.sapelee_event_outbox o, p WHERE o.shop_id = p.shop_id) = 0 THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 20, 'A isolation', 'shop_mirrors rows referencing the demo shop', '0',
    (SELECT count(*) FROM public.shop_mirrors m, p WHERE m.shop_id = p.shop_id OR m.mirror_shop_id = p.shop_id)::text,
    CASE WHEN (SELECT count(*) FROM public.shop_mirrors m, p WHERE m.shop_id = p.shop_id OR m.mirror_shop_id = p.shop_id) = 0 THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 21, 'A isolation', 'other shops in the demo shop''s organization', '0',
    (SELECT count(*) FROM public.shops s, shop d WHERE s.organization_id = d.organization_id AND s.id <> d.id)::text,
    CASE WHEN (SELECT count(*) FROM shop) = 1
          AND (SELECT organization_id IS NOT NULL FROM shop)
          AND (SELECT count(*) FROM public.shops s, shop d WHERE s.organization_id = d.organization_id AND s.id <> d.id) = 0
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 22, 'A isolation', 'RO-DEMO-330 in the demo shop: rows, status, invoice', '1, Open, INV-DEMO-330',
    (SELECT count(*) || ', ' || coalesce(min(r.status), '-') || ', ' || coalesce(min(r.invoice_number), '-')
       FROM public.repair_orders r, p WHERE r.shop_id = p.shop_id AND r.ro_number = 'RO-DEMO-330'),
    CASE WHEN (SELECT count(*) = 1 AND min(r.status) = 'Open' AND min(r.invoice_number) = 'INV-DEMO-330'
       FROM public.repair_orders r, p WHERE r.shop_id = p.shop_id AND r.ro_number = 'RO-DEMO-330') THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 23, 'A isolation', 'demo job card (Jordan Blake, 2021 BMW 330i): rows, status', '1, Booked',
    (SELECT count(*) || ', ' || coalesce(min(j.status), '-')
       FROM public.job_cards j, p WHERE j.shop_id = p.shop_id AND j.customer = 'Jordan Blake' AND j.vehicle = '2021 BMW 330i'),
    CASE WHEN (SELECT count(*) = 1 AND min(j.status) = 'Booked'
       FROM public.job_cards j, p WHERE j.shop_id = p.shop_id AND j.customer = 'Jordan Blake' AND j.vehicle = '2021 BMW 330i') THEN 'PASS' ELSE 'STOP' END

  -- B
  UNION ALL
  SELECT 30, 'B pg_net privileges', 'roles audited (a browser session is anon, then authenticated)', 'PUBLIC, anon, authenticated',
    (SELECT string_agg(label, ', ' ORDER BY label) FROM who_ok),
    CASE WHEN (SELECT count(*) FROM who_ok) = 3 THEN 'INFO' ELSE 'STOP' END
  UNION ALL
  SELECT 31, 'B pg_net privileges', 'net schema: CREATE', 'none',
    coalesce((SELECT string_agg(label, ', ' ORDER BY label) FROM ns_priv WHERE has_create), 'none'),
    CASE WHEN NOT EXISTS (SELECT 1 FROM net_ns) THEN 'STOP'
         WHEN EXISTS (SELECT 1 FROM ns_priv WHERE has_create) THEN 'STOP' ELSE 'PASS' END
  UNION ALL
  SELECT 32, 'B pg_net privileges', 'net schema: USAGE (makes the table privileges below effective rather than latent)', '(record)',
    coalesce((SELECT string_agg(label, ', ' ORDER BY label) FROM ns_priv WHERE has_usage), 'none'),
    'INFO'
  UNION ALL
  SELECT 33 + (r.obj = 'net._http_response')::int * 2, 'B pg_net privileges', r.obj || ': table privileges', 'none',
    coalesce(string_agg(rp.label || ' ' || rp.held
      || CASE WHEN (SELECT has_usage FROM ns_priv np WHERE np.label = rp.label) THEN ' [effective]' ELSE ' [latent]' END,
      '; ' ORDER BY rp.label) FILTER (WHERE rp.held IS NOT NULL), 'none'),
    CASE WHEN r.oid IS NULL THEN 'STOP'
         WHEN bool_or(rp.held IS NOT NULL) THEN 'STOP' ELSE 'PASS' END
  FROM net_rel r LEFT JOIN rel_priv rp ON rp.obj = r.obj
  GROUP BY r.obj, r.oid
  UNION ALL
  SELECT 34 + (c.obj = 'net._http_response')::int * 2, 'B pg_net privileges',
    c.obj || CASE WHEN c.obj = 'net._http_response' THEN ': SELECT on headers or content' ELSE ': SELECT on headers or body' END, 'none',
    coalesce(string_agg(cp.label || ' ' || cp.cols, '; ' ORDER BY cp.label) FILTER (WHERE cp.cols IS NOT NULL), 'none'),
    CASE WHEN bool_or(cp.cols IS NOT NULL) THEN 'STOP' ELSE 'PASS' END
  FROM (SELECT DISTINCT obj FROM net_col) c LEFT JOIN col_priv cp ON cp.obj = c.obj
  GROUP BY c.obj
  UNION ALL
  SELECT 37, 'B pg_net privileges', 'request-id sequence (' || coalesce((SELECT seqname FROM req_seq), 'not found') || '): USAGE, SELECT, UPDATE', 'none',
    coalesce((SELECT string_agg(label || ' ' || held, '; ' ORDER BY label) FROM seq_priv WHERE held IS NOT NULL), 'none'),
    CASE WHEN (SELECT oid FROM req_seq_rel) IS NULL THEN 'STOP'
         WHEN EXISTS (SELECT 1 FROM seq_priv WHERE held IS NOT NULL) THEN 'STOP' ELSE 'PASS' END
  UNION ALL
  SELECT 38, 'B pg_net privileges', 'net functions that queue requests or return responses, executable', 'none',
    coalesce((SELECT string_agg(label || ' ' || proname, '; ' ORDER BY label, proname) FROM net_fn_exec WHERE touches_pg_net), 'none'),
    CASE WHEN EXISTS (SELECT 1 FROM net_fn_exec WHERE touches_pg_net) THEN 'STOP' ELSE 'PASS' END
  UNION ALL
  SELECT 39, 'B pg_net privileges', 'other net functions, executable', 'none',
    coalesce((SELECT string_agg(label || ' ' || proname, '; ' ORDER BY label, proname) FROM net_fn_exec WHERE NOT touches_pg_net), 'none'),
    CASE WHEN EXISTS (SELECT 1 FROM net_fn_exec WHERE NOT touches_pg_net) THEN 'REVIEW' ELSE 'PASS' END
  UNION ALL
  SELECT 40, 'B pg_net privileges', 'non-trigger functions outside net that read the queue or responses, executable', 'none',
    coalesce((SELECT string_agg(label || ' ' || fname, '; ' ORDER BY label, fname) FROM outside_fn_exec), 'none'),
    CASE WHEN EXISTS (SELECT 1 FROM outside_fn_exec) THEN 'STOP' ELSE 'PASS' END

  -- C
  UNION ALL
  SELECT 50, 'C live definitions', 'functions outside net that make or read HTTP calls', 'public.notify_push_on_alert',
    coalesce((SELECT string_agg(fname, ', ' ORDER BY fname) FROM http_callers), '(none)'),
    CASE WHEN (SELECT coalesce(string_agg(fname, ', ' ORDER BY fname), '') FROM http_callers) = 'public.notify_push_on_alert'
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 51, 'C live definitions', 'notify_push_on_alert: definitions, net.http_post calls, posts to /api/push/send', '1, 1, true',
    (SELECT count(*) FROM push_fn)::text || ', '
      || coalesce((SELECT ((length(prosrc) - length(replace(prosrc, 'net.http_post', ''))) / length('net.http_post'))::text FROM push_fn LIMIT 1), '-')
      || ', ' || coalesce((SELECT (position('''https://www.redlined1.com/api/push/send''' IN prosrc) > 0)::text FROM push_fn LIMIT 1), '-'),
    CASE WHEN (SELECT count(*) FROM push_fn) = 1
          AND (SELECT (length(prosrc) - length(replace(prosrc, 'net.http_post', ''))) / length('net.http_post') = 1
                  AND position('''https://www.redlined1.com/api/push/send''' IN prosrc) > 0 FROM push_fn LIMIT 1)
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 52, 'C live definitions', 'triggers calling supabase_functions (Database Webhooks)', '0',
    (SELECT n::text FROM webhook_triggers),
    CASE WHEN (SELECT n FROM webhook_triggers) = 0 THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 53, 'C live definitions', 'pg_cron installed (a job calling HTTP during the take makes FINISH report UNPROVEN)', '(record)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN 'yes' ELSE 'no' END,
    'INFO'
  UNION ALL
  SELECT 54, 'C live definitions', 'user triggers on the tables the walkthrough writes', expected, actual,
    CASE WHEN expected = actual THEN 'PASS' ELSE 'STOP' END
  FROM trig_pin
  UNION ALL
  SELECT fv.ord, 'C live definitions', 'md5(prosrc) of public.' || fv.fname || ' equals the repository source',
    fv.exact_md5, coalesce(fv.live_exact, 'missing') || CASE WHEN fv.n_defs <> 1 THEN ' (' || fv.n_defs || ' definitions)' ELSE '' END,
    fv.verdict
  FROM fn_verdict fv
  UNION ALL
  SELECT 61, 'C live definitions', 'walkthrough alerts proven from those definitions',
    '5: Open>In Progress, In Progress>Pending Parts, Pending Parts>In Progress (ro.status_changed); In Progress>Pending Approval (ro.pending_approval only); Pending Approval>Complete (ro.status_changed)',
    CASE WHEN (SELECT expected = actual FROM trig_pin) AND NOT EXISTS (SELECT 1 FROM fn_verdict WHERE verdict <> 'PASS')
         THEN 'proven: live triggers and functions equal the source' ELSE 'not proven: see rows 54-60' END,
    CASE WHEN (SELECT expected = actual FROM trig_pin) AND NOT EXISTS (SELECT 1 FROM fn_verdict WHERE verdict <> 'PASS')
         THEN 'PASS' ELSE 'STOP' END

  -- D
  UNION ALL
  SELECT 70, 'D baselines', 'pg_net extension version', '(record)',
    coalesce((SELECT extversion FROM pg_extension WHERE extname = 'pg_net'), 'not installed'), 'INFO'
  UNION ALL
  SELECT 71, 'D baselines', 'request-id sequence: found, increment_by, cache_size', 'yes, 1, 1',
    CASE WHEN (SELECT count(*) FROM req_seq_state) = 1 THEN 'yes' ELSE 'no' END
      || ', ' || coalesce((SELECT increment_by::text FROM req_seq_state), '-')
      || ', ' || coalesce((SELECT cache_size::text FROM req_seq_state), '-'),
    CASE WHEN (SELECT count(*) FROM req_seq_state) = 1 AND (SELECT increment_by = 1 AND cache_size = 1 FROM req_seq_state)
         THEN 'PASS' ELSE 'STOP' END
  UNION ALL
  SELECT 72, 'D baselines', 'pg_net.ttl (responses older than this are deleted; run FINISH well within it)', '(record)',
    coalesce(current_setting('pg_net.ttl', true), '(unset: pg_net default)'), 'INFO'
  UNION ALL
  SELECT 73, 'D baselines', 'queued requests not yet sent, all shops', '(record)',
    (SELECT count(*) FROM net.http_request_queue)::text, 'INFO'
  UNION ALL
  SELECT 74, 'D baselines', 'invoice_number_seq last_value (I0)', '(record)', (SELECT coalesce(i0, 'missing') FROM base),
    CASE WHEN (SELECT i0 FROM base) IS NULL THEN 'STOP' ELSE 'RECORD' END
  UNION ALL
  SELECT 75, 'D baselines', 'alert_events rows, all shops (C0)', '(record)', (SELECT c0::text FROM base), 'RECORD'
  UNION ALL
  SELECT 76, 'D baselines', 'alert_events rows, demo shop, before the take', '(record)',
    (SELECT count(*) FROM public.alert_events a, p WHERE a.shop_id = p.shop_id)::text, 'RECORD'
  UNION ALL
  SELECT 77, 'D baselines', 'request id handed out last (S0)', '(record)', coalesce((SELECT s0::text FROM base), 'missing'),
    CASE WHEN (SELECT s0 FROM base) IS NULL THEN 'STOP' ELSE 'RECORD' END
  UNION ALL
  SELECT 78, 'D baselines', 'window start (T0, UTC)', '(record)', (SELECT t0_text FROM base), 'RECORD'
  UNION ALL
  SELECT 79, 'D baselines', 'md5 of the live notify_push_on_alert (NP)', '(record)', coalesce((SELECT np FROM base), 'missing'),
    CASE WHEN (SELECT np FROM base) IS NULL THEN 'STOP' ELSE 'RECORD' END
  UNION ALL
  SELECT 900, 'TOKEN', 'START TOKEN (copy exactly into OWNER FINISH SQL)', '(record)',
    t.payload || ';CHK=' || left(md5(t.payload), 8), 'RECORD'
  FROM token t
)
SELECT ord, section, check_name, expected, actual, verdict FROM checks
UNION ALL
SELECT 999, 'VERDICT', 'may the capture start?', 'CAPTURE MAY START',
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict IN ('STOP', 'REVIEW'))
       THEN 'DO NOT START: ' || (SELECT count(*) FROM checks WHERE verdict = 'STOP') || ' STOP, '
            || (SELECT count(*) FROM checks WHERE verdict = 'REVIEW') || ' REVIEW'
       ELSE 'CAPTURE MAY START' END,
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict IN ('STOP', 'REVIEW')) THEN 'STOP' ELSE 'PASS' END
ORDER BY ord;

ROLLBACK;
