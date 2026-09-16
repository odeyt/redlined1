-- =============================================================================
-- OWNER FINISH SQL - marketing capture, alert and push gates (correlation Option A)
-- =============================================================================
-- READ ONLY. Run in the Supabase SQL Editor, as postgres, after the capture
-- finishes and well within pg_net.ttl (START row 72). It changes nothing: one
-- read-only transaction, rolled back. From pg_net it reads only request ids,
-- response status, timeout, error and response body. It never reads queued
-- request headers or bodies, which carry the push secret.
--
-- Edit exactly two things, both ASCII tokens:
--   __START_TOKEN__   row 900 of OWNER START SQL
--   __LEDGER_TOKEN__  the LEDGER TOKEN line the capture printed
-- The SHA-256 pinned in the repository is of this file before those edits.
--
-- How alert k is paired with its push request (no timestamps alone, no
-- aggregate counts alone), all of which must hold:
--   * transaction identity: the alert and its ro_status_events row share xmin;
--   * the request-id sequence advanced by exactly 5 since START;
--   * alert_events grew by exactly 5 across ALL shops, and every alert since T0
--     is a demo alert, so no other caller took an id in the window;
--   * alert k (in transaction order) is request S0+k; its response has that
--     exact id, status 200, no timeout or error, body exactly {"ok":true,"sent":0};
--   * md5 of the ordered alert ids equals the capture's local ledger.
--
-- Row 999: PROVEN, PENDING (re-run in a minute), UNPROVEN (take unusable),
-- FAILED, or CRITICAL (stop and report; repair nothing).
-- =============================================================================
BEGIN TRANSACTION READ ONLY;

WITH
params AS (
  SELECT '__START_TOKEN__'::text AS start_token, '__LEDGER_TOKEN__'::text AS ledger_token
),
st AS (
  SELECT regexp_match(start_token,
    '^(RL1S;SHOP=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12});S0=(-?[0-9]{1,18});C0=([0-9]{1,18});T0=([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z);I0=([0-9]{1,18}|none);NP=([0-9a-f]{32}));CHK=([0-9a-f]{8})$') AS m
  FROM params
),
lt AS (
  SELECT regexp_match(ledger_token,
    '^(RL1L;SHOP=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12});N=([0-9]{1,3});MD5=([0-9a-f]{32}));CHK=([0-9a-f]{8})$') AS m
  FROM params
),
p AS (
  SELECT
    st.m IS NOT NULL AND left(md5(st.m[1]), 8) = st.m[8] AS start_ok,
    lt.m IS NOT NULL AND left(md5(lt.m[1]), 8) = lt.m[5] AS ledger_ok,
    CASE WHEN st.m IS NOT NULL THEN st.m[2]::uuid END AS shop_id,
    CASE WHEN lt.m IS NOT NULL THEN lt.m[2]::uuid END AS ledger_shop_id,
    CASE WHEN st.m IS NOT NULL THEN st.m[3]::bigint END AS s0,
    CASE WHEN st.m IS NOT NULL THEN st.m[4]::bigint END AS c0,
    CASE WHEN st.m IS NOT NULL THEN st.m[5]::timestamptz END AS t0,
    CASE WHEN st.m IS NOT NULL THEN st.m[6] END AS i0,
    CASE WHEN st.m IS NOT NULL THEN st.m[7] END AS np,
    CASE WHEN lt.m IS NOT NULL THEN lt.m[3]::int END AS ledger_n,
    CASE WHEN lt.m IS NOT NULL THEN lt.m[4] END AS ledger_md5
  FROM st CROSS JOIN lt
),
expected (k, event_type, old_status, new_status, title) AS (VALUES
  (1, 'ro.status_changed', 'Open', 'In Progress', 'RO-DEMO-330 ' || chr(8594) || ' In Progress'),
  (2, 'ro.status_changed', 'In Progress', 'Pending Parts', 'RO-DEMO-330 ' || chr(8594) || ' Pending Parts'),
  (3, 'ro.status_changed', 'Pending Parts', 'In Progress', 'RO-DEMO-330 ' || chr(8594) || ' In Progress'),
  (4, 'ro.pending_approval', 'In Progress', 'Pending Approval', 'RO-DEMO-330 is ready for QA sign-off'),
  (5, 'ro.status_changed', 'Pending Approval', 'Complete', 'RO-DEMO-330 ' || chr(8594) || ' Complete')
),
n AS (
  SELECT count(*) AS expected_n FROM expected
),
ro AS (
  SELECT r.id FROM public.repair_orders r JOIN p ON r.shop_id = p.shop_id WHERE r.ro_number = 'RO-DEMO-330'
),
member AS (
  SELECT su.user_id FROM public.shop_users su JOIN p ON su.shop_id = p.shop_id
),

-- Live definitions, re-checked: they must not have changed during the window.
fn AS (
  SELECT pr.oid, n.nspname, pr.proname, pr.prosrc
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public'
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
  SELECT fp.ord, fp.fname, fp.exact_md5,
    (SELECT count(*) FROM fn f WHERE f.proname = fp.fname) AS n_defs,
    (SELECT md5(f.prosrc) FROM fn f WHERE f.proname = fp.fname LIMIT 1) AS live_exact
  FROM fn_pin fp
),
push_md5 AS (
  SELECT md5(f.prosrc) AS np, (SELECT count(*) FROM fn g WHERE g.proname = 'notify_push_on_alert') AS n_defs
  FROM fn f WHERE f.proname = 'notify_push_on_alert' LIMIT 1
),

-- The pg_net request-id sequence, now.
req_seq AS (
  SELECT CASE WHEN to_regclass('net.http_request_queue') IS NULL THEN NULL
              ELSE pg_get_serial_sequence('net.http_request_queue', 'id') END AS seqname
),
req_seq_rel AS (
  SELECT to_regclass(rs.seqname) AS oid FROM req_seq rs
),
seq AS (
  SELECT coalesce(s.last_value, s.start_value - s.increment_by) AS s1
  FROM pg_sequences s JOIN req_seq_rel r ON r.oid IS NOT NULL
   AND (quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename))::regclass = r.oid
),
ttl AS (
  SELECT CASE WHEN pg_input_is_valid(coalesce(current_setting('pg_net.ttl', true), '6 hours'), 'interval')
              THEN coalesce(current_setting('pg_net.ttl', true), '6 hours')::interval
              ELSE interval '6 hours' END AS ttl
),

-- The window.
all_since AS (
  SELECT a.id, a.shop_id FROM public.alert_events a JOIN p ON a.created_at >= p.t0
),
demo_alerts AS (
  SELECT
    row_number() OVER (ORDER BY a.xmin::text::bigint, a.created_at, a.id) AS k,
    row_number() OVER (ORDER BY a.created_at, a.xmin::text::bigint, a.id) AS k_time,
    a.id, a.event_type, a.target_user_id, a.target_role, a.title, a.entity_type, a.entity_id, a.created_by,
    a.xmin::text::bigint AS x
  FROM public.alert_events a JOIN p ON a.shop_id = p.shop_id AND a.created_at >= p.t0
),
demo_status AS (
  SELECT s.repair_order_id, s.old_status, s.new_status, s.changed_by, s.xmin::text::bigint AS x
  FROM public.ro_status_events s JOIN p ON s.shop_id = p.shop_id AND s.created_at >= p.t0
),
resp AS (
  SELECT r.id, r.status_code, r.timed_out, r.error_msg, r.content
  FROM net._http_response r JOIN p ON r.id > p.s0 AND r.id <= p.s0 + 5
),
unsent AS (
  SELECT q.id FROM net.http_request_queue q CROSS JOIN p CROSS JOIN seq
  WHERE q.id > p.s0 AND q.id <= greatest(seq.s1, p.s0 + 5)
),
exclusive AS (
  SELECT
    (SELECT s1 FROM seq) - p.s0 AS seq_delta,
    (SELECT count(*) FROM public.alert_events) - p.c0 AS all_delta,
    (SELECT count(*) FROM all_since) AS since_total,
    (SELECT count(*) FROM all_since a WHERE a.shop_id IS DISTINCT FROM p.shop_id) AS since_other,
    (SELECT count(*) FROM demo_alerts) AS demo_n,
    (SELECT count(*) FROM demo_alerts WHERE k <> k_time) AS order_disagreements,
    (SELECT count(*) FROM demo_alerts WHERE x < 3) AS frozen,
    now() - p.t0 > (SELECT ttl FROM ttl) AS expired
  FROM p
),
per_k AS (
  SELECT e.k, e.event_type AS exp_type, e.old_status AS exp_old, e.new_status AS exp_new, e.title AS exp_title,
    d.id AS alert_id, d.event_type, d.title, d.target_user_id, d.target_role, d.entity_type, d.entity_id, d.created_by, d.x,
    (SELECT count(*) FROM demo_status s WHERE s.x = d.x) AS tx_status_rows,
    (SELECT string_agg(coalesce(s.old_status, 'null') || '>' || s.new_status, ',') FROM demo_status s WHERE s.x = d.x) AS tx_transition,
    (SELECT bool_and(s.repair_order_id IS NOT DISTINCT FROM (SELECT id FROM ro LIMIT 1)
                     AND s.changed_by IS NOT DISTINCT FROM (SELECT user_id FROM member LIMIT 1))
       FROM demo_status s WHERE s.x = d.x) AS tx_status_ok,
    p.s0 + e.k AS request_id,
    r.id AS resp_id, r.status_code, r.timed_out, r.error_msg,
    CASE WHEN r.id IS NOT NULL AND pg_input_is_valid(coalesce(r.content, ''), 'jsonb') THEN r.content::jsonb END AS j,
    EXISTS (SELECT 1 FROM unsent u WHERE u.id = p.s0 + e.k) AS still_queued
  FROM expected e
  CROSS JOIN p
  LEFT JOIN demo_alerts d ON d.k = e.k
  LEFT JOIN resp r ON r.id = p.s0 + e.k
),
per_k_verdict AS (
  SELECT pk.*,
    CASE
      WHEN NOT (SELECT start_ok AND ledger_ok FROM p) THEN 'FAIL'
      WHEN pk.alert_id IS NULL THEN 'FAIL'
      WHEN pk.event_type IS DISTINCT FROM pk.exp_type OR pk.title IS DISTINCT FROM pk.exp_title
        OR pk.target_user_id IS NOT NULL OR pk.target_role IS NOT NULL
        OR pk.entity_type IS DISTINCT FROM 'repair_order' OR pk.entity_id IS DISTINCT FROM (SELECT id::text FROM ro LIMIT 1)
        OR pk.created_by IS DISTINCT FROM (SELECT user_id FROM member LIMIT 1)
        OR (SELECT count(*) FROM member) <> 1 THEN 'FAIL'
      WHEN pk.tx_status_rows <> 1 OR pk.tx_transition IS DISTINCT FROM (pk.exp_old || '>' || pk.exp_new)
        OR pk.tx_status_ok IS NOT TRUE THEN 'FAIL'
      WHEN pk.x < 3 THEN 'UNPROVEN'
      WHEN (SELECT seq_delta <> 5 OR all_delta <> 5 OR since_total <> 5 OR since_other <> 0 OR order_disagreements <> 0 FROM exclusive)
        THEN 'UNPROVEN'
      WHEN pk.resp_id IS NULL AND pk.still_queued THEN 'PENDING'
      WHEN pk.resp_id IS NULL AND (SELECT expired FROM exclusive) THEN 'UNPROVEN'
      WHEN pk.resp_id IS NULL THEN 'FAIL'
      WHEN pk.j ? 'pruned' OR (jsonb_typeof(pk.j -> 'sent') = 'number' AND (pk.j ->> 'sent')::numeric > 0) THEN 'CRITICAL'
      WHEN pk.timed_out IS TRUE OR pk.error_msg IS NOT NULL THEN 'FAIL'
      WHEN pk.status_code IS DISTINCT FROM 200 THEN 'FAIL'
      WHEN pk.j IS DISTINCT FROM '{"ok": true, "sent": 0}'::jsonb THEN 'FAIL'
      ELSE 'PASS'
    END AS verdict
  FROM per_k pk
),

checks (ord, section, check_name, expected, actual, verdict) AS (
  SELECT 10, 'A tokens', 'START TOKEN format and checksum', 'valid',
    CASE WHEN p.start_ok THEN 'valid' ELSE 'invalid: paste row 900 of OWNER START SQL exactly' END,
    CASE WHEN p.start_ok THEN 'PASS' ELSE 'FAIL' END FROM p
  UNION ALL
  SELECT 11, 'A tokens', 'LEDGER TOKEN format and checksum', 'valid',
    CASE WHEN p.ledger_ok THEN 'valid' ELSE 'invalid: paste the capture''s LEDGER TOKEN exactly' END,
    CASE WHEN p.ledger_ok THEN 'PASS' ELSE 'FAIL' END FROM p
  UNION ALL
  SELECT 12, 'A tokens', 'both tokens name the same demo shop', 'yes',
    CASE WHEN p.shop_id IS NOT NULL AND p.shop_id = p.ledger_shop_id THEN 'yes' ELSE 'no' END,
    CASE WHEN p.shop_id IS NOT NULL AND p.shop_id = p.ledger_shop_id THEN 'PASS' ELSE 'FAIL' END FROM p
  UNION ALL
  SELECT 13, 'A tokens', 'alert count the capture expected equals the source- and live-proven count', (SELECT expected_n::text FROM n),
    coalesce(p.ledger_n::text, '-'),
    CASE WHEN p.ledger_n = (SELECT expected_n FROM n) AND (SELECT expected_n FROM n) = 5 THEN 'PASS' ELSE 'FAIL' END FROM p

  UNION ALL
  SELECT 20, 'B definitions unchanged', 'user triggers on the tables the walkthrough writes', expected, actual,
    CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END
  FROM trig_pin
  UNION ALL
  SELECT fl.ord - 34, 'B definitions unchanged', 'md5(prosrc) of public.' || fl.fname, fl.exact_md5,
    coalesce(fl.live_exact, 'missing') || CASE WHEN fl.n_defs <> 1 THEN ' (' || fl.n_defs || ' definitions)' ELSE '' END,
    CASE WHEN fl.n_defs = 1 AND fl.live_exact = fl.exact_md5 THEN 'PASS' ELSE 'FAIL' END
  FROM fn_live fl
  UNION ALL
  SELECT 27, 'B definitions unchanged', 'md5 of notify_push_on_alert equals START (NP)', coalesce(p.np, '-'),
    coalesce((SELECT np FROM push_md5), 'missing'),
    CASE WHEN (SELECT n_defs FROM push_md5) = 1 AND (SELECT np FROM push_md5) = p.np THEN 'PASS' ELSE 'FAIL' END FROM p

  UNION ALL
  SELECT 30, 'C exclusive window', 'pg_net request-id sequence delta (S1 - S0)', '5',
    coalesce((SELECT seq_delta::text FROM exclusive), '-'),
    CASE WHEN (SELECT seq_delta FROM exclusive) = 5 THEN 'PASS' ELSE 'UNPROVEN' END
  UNION ALL
  SELECT 31, 'C exclusive window', 'alert_events delta, all shops (C1 - C0)', '5',
    coalesce((SELECT all_delta::text FROM exclusive), '-'),
    CASE WHEN (SELECT all_delta FROM exclusive) = 5 THEN 'PASS' ELSE 'UNPROVEN' END
  UNION ALL
  SELECT 32, 'C exclusive window', 'alerts since T0: all shops, outside the demo shop', '5, 0',
    coalesce((SELECT since_total || ', ' || since_other FROM exclusive), '-'),
    CASE WHEN (SELECT since_total = 5 AND since_other = 0 FROM exclusive) THEN 'PASS' ELSE 'UNPROVEN' END
  UNION ALL
  SELECT 33, 'C exclusive window', 'demo alerts since T0', '5',
    coalesce((SELECT demo_n::text FROM exclusive), '-'),
    CASE WHEN (SELECT demo_n FROM exclusive) = 5 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 34, 'C exclusive window', 'demo alerts: transaction order equals time order; no frozen xmin', '0, 0',
    coalesce((SELECT order_disagreements || ', ' || frozen FROM exclusive), '-'),
    CASE WHEN (SELECT order_disagreements = 0 AND frozen = 0 FROM exclusive) THEN 'PASS' ELSE 'UNPROVEN' END
  UNION ALL
  SELECT 35, 'C exclusive window', 'md5 of ordered demo alert ids equals the ledger', coalesce(p.ledger_md5, '-'),
    coalesce((SELECT md5(string_agg(id::text, ',' ORDER BY k)) FROM demo_alerts), '-'),
    CASE WHEN (SELECT md5(string_agg(id::text, ',' ORDER BY k)) FROM demo_alerts) = p.ledger_md5 THEN 'PASS' ELSE 'FAIL' END FROM p
  UNION ALL
  SELECT 36, 'C exclusive window', 'demo status events since T0', '5',
    (SELECT count(*)::text FROM demo_status),
    CASE WHEN (SELECT count(*) FROM demo_status) = 5 THEN 'PASS' ELSE 'FAIL' END

  UNION ALL
  SELECT 40 + v.k, 'D alert to request', 'alert ' || v.k || ': ' || v.exp_type || ' ' || v.exp_old || ' > ' || v.exp_new,
    'same-transaction status event; request S0+' || v.k || '; 200; no timeout or error; {"ok":true,"sent":0}',
    'alert=' || coalesce(v.alert_id::text, 'missing')
      || ' type=' || coalesce(v.event_type, '-')
      || ' tx_status=' || coalesce(v.tx_transition, '-') || ' (' || v.tx_status_rows || ' row)'
      || ' request=' || coalesce(v.request_id::text, '-')
      || ' response=' || CASE WHEN v.resp_id IS NULL THEN CASE WHEN v.still_queued THEN 'queued' ELSE 'none' END ELSE v.resp_id::text END
      || ' status=' || coalesce(v.status_code::text, '-')
      || ' timed_out=' || coalesce(v.timed_out::text, '-')
      || ' error=' || coalesce(left(v.error_msg, 80), '-')
      || ' body=' || CASE
           WHEN v.resp_id IS NULL THEN '-'
           WHEN v.j IS NULL THEN 'not JSON'
           WHEN jsonb_typeof(v.j) <> 'object' THEN 'JSON ' || jsonb_typeof(v.j)
           ELSE 'keys=' || coalesce((SELECT string_agg(key, ',' ORDER BY key) FROM jsonb_object_keys(v.j) AS key), '')
                || ' sent=' || coalesce(v.j ->> 'sent', '-')
         END,
    v.verdict
  FROM per_k_verdict v

  UNION ALL
  SELECT 50, 'E after the take', 'requests in the window not yet sent by pg_net', '0',
    (SELECT count(*)::text FROM unsent),
    CASE WHEN (SELECT count(*) FROM unsent) = 0 THEN 'PASS' ELSE 'PENDING' END
  UNION ALL
  SELECT 60, 'E after the take', 'invoice_number_seq last_value unchanged (I0)', coalesce(p.i0, '-'),
    coalesce((SELECT CASE WHEN last_value IS NULL THEN 'none' ELSE last_value::text END
                FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'invoice_number_seq'), 'missing'),
    CASE WHEN p.i0 IS NOT NULL AND p.i0 = (SELECT CASE WHEN last_value IS NULL THEN 'none' ELSE last_value::text END
                FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'invoice_number_seq')
         THEN 'PASS' ELSE 'CRITICAL' END FROM p
  UNION ALL
  SELECT 61, 'E after the take', 'push subscriptions: demo member, demo shop', '0, 0',
    (SELECT count(*) FROM public.push_subscriptions ps WHERE ps.user_id IN (SELECT user_id FROM member))::text || ', '
      || (SELECT count(*) FROM public.push_subscriptions ps WHERE ps.shop_id = p.shop_id)::text,
    CASE WHEN (SELECT count(*) FROM public.push_subscriptions ps WHERE ps.user_id IN (SELECT user_id FROM member)) = 0
          AND (SELECT count(*) FROM public.push_subscriptions ps WHERE ps.shop_id = p.shop_id) = 0
         THEN 'PASS' ELSE 'CRITICAL' END FROM p
  UNION ALL
  SELECT 62, 'E after the take', 'Sapelee outbox rows for the demo shop', '0',
    (SELECT count(*) FROM public.sapelee_event_outbox o WHERE o.shop_id = p.shop_id)::text,
    CASE WHEN (SELECT count(*) FROM public.sapelee_event_outbox o WHERE o.shop_id = p.shop_id) = 0 THEN 'PASS' ELSE 'CRITICAL' END FROM p
  UNION ALL
  SELECT 63, 'E after the take', 'demo shop members', '1',
    (SELECT count(*)::text FROM member),
    CASE WHEN (SELECT count(*) FROM member) = 1 THEN 'PASS' ELSE 'FAIL' END
)
SELECT ord, section, check_name, expected, actual, verdict FROM checks
UNION ALL
SELECT 999, 'VERDICT', 'is every demo alert correlated to a harmless push request?', 'PROVEN',
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'CRITICAL') THEN 'CRITICAL: stop and report; repair nothing'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'FAIL') THEN 'FAILED: take unusable; report'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'UNPROVEN') THEN 'UNPROVEN: window not exclusive; take unusable'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'PENDING') THEN 'PENDING: re-run in one minute'
       ELSE 'PROVEN' END,
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'CRITICAL') THEN 'CRITICAL'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'FAIL') THEN 'FAIL'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'UNPROVEN') THEN 'UNPROVEN'
       WHEN EXISTS (SELECT 1 FROM checks WHERE verdict = 'PENDING') THEN 'PENDING'
       ELSE 'PASS' END
ORDER BY ord;

ROLLBACK;
