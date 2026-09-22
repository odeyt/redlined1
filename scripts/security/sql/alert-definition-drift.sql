-- =============================================================================
-- PHASE D - alert definition drift (READ ONLY)
-- =============================================================================
-- Run in the Supabase SQL Editor as postgres. It changes nothing: one read-only
-- transaction, rolled back. There is nothing to edit.
--
-- WHY THIS EXISTS
-- OWNER START SQL reported that the live trigger and function definitions
-- differ from the repository, and that job_cards.trg_free_tier_limit is absent.
-- Until that is reconciled, the five-alert expectation is unproven. This audit
-- answers three questions for each object, without changing anything:
--
--   1. does the live definition match the repository byte for byte?
--   2. if not, which SEMANTIC markers differ (each marker is a behaviour, and
--      several of them date a definition to a specific migration)?
--   3. is production OLDER than the repository (a migration was never applied),
--      NEWER or diverged (something was changed outside the repository), or is
--      the object MISSING altogether?
--
-- It never overwrites anything, and no repository definition is installed from
-- it. Reconciliation is a separate, separately approved piece of work.
--
-- WHAT IT NEVER READS
-- No Vault value and no secret literal. public.notify_push_on_alert reads the
-- push secret from Vault, so its source is NEVER printed here: only its md5 and
-- boolean markers. The alert trigger functions carry no secrets, so their
-- source is printed for an exact diff - but only after a secret-shaped pattern
-- check, which withholds the source and prints the md5 instead if it matches.
--
-- Verdicts: MATCH, WHITESPACE (review, not a match), DIFFERS, MISSING,
-- DUPLICATE, RECORD, INFO. Row 999 counts the objects that are not MATCH.
-- =============================================================================
BEGIN TRANSACTION READ ONLY;

WITH
-- The repository fingerprints, from lib/marketing-capture/alertExpectation.ts.
repo (ord, fname, exact_md5, normalized_md5) AS (VALUES
  (10, 'alert_ro_status_changed', 'f5ada9b8f4ea481a8c809bcea94171ba', '131af272466ac2d370bbb0ccd83a089a'),
  (11, 'alert_ro_pending_approval', 'e7005a0910cb37bb0444a7515030472a', '64d2a3a9ad137fc1ee48daf8c4107674'),
  (12, 'emit_alert_event', '7ca2ecc78830f45619d5738410ae661b', '8fd2dbfabe529f640aedc1d79a9fd0bf'),
  (13, 'record_ro_status_change', 'b4ae5ee9174d62d41e3d9ef78cb4249f', '4d46681b324bd342f4b7a0d99217f4e7'),
  (14, 'alert_job_assigned', 'ad16d7dc2e0e27e485cf6a7ac057c722', 'a5c677036225a521fc3067504441a34f'),
  (15, 'alert_job_work_added', '010c9883b74b759a08cef5ac6ef272a8', '2987c8c85f44f7b477b2b681505f1914')
),
live AS (
  SELECT p.oid, p.proname, p.prosrc, p.prosecdef, p.proowner::regrole::text AS owner,
    array_to_string(p.proconfig, ',') AS config,
    coalesce(p.proacl::text, '(default: PUBLIC EXECUTE)') AS acl,
    md5(p.prosrc) AS exact_md5,
    md5(btrim(regexp_replace(p.prosrc, '[ \t\n\r\f\v]+', ' ', 'g'))) AS normalized_md5,
    (length(p.prosrc) - length(replace(p.prosrc, chr(10), ''))) + 1 AS src_lines,
    p.prosrc ~* 'decrypted_secret|vault\.|password|apikey|api_key|bearer |authorization' AS looks_sensitive
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
compared AS (
  SELECT r.ord, r.fname, r.exact_md5 AS repo_md5, r.normalized_md5 AS repo_norm,
    (SELECT count(*) FROM live l WHERE l.proname = r.fname) AS n_defs,
    (SELECT l.exact_md5 FROM live l WHERE l.proname = r.fname LIMIT 1) AS live_md5,
    (SELECT l.normalized_md5 FROM live l WHERE l.proname = r.fname LIMIT 1) AS live_norm,
    (SELECT l.src_lines FROM live l WHERE l.proname = r.fname LIMIT 1) AS live_lines,
    (SELECT l.owner FROM live l WHERE l.proname = r.fname LIMIT 1) AS owner,
    (SELECT l.prosecdef FROM live l WHERE l.proname = r.fname LIMIT 1) AS secdef,
    (SELECT l.config FROM live l WHERE l.proname = r.fname LIMIT 1) AS config,
    (SELECT l.acl FROM live l WHERE l.proname = r.fname LIMIT 1) AS acl,
    (SELECT l.looks_sensitive FROM live l WHERE l.proname = r.fname LIMIT 1) AS looks_sensitive,
    (SELECT l.prosrc FROM live l WHERE l.proname = r.fname LIMIT 1) AS src
  FROM repo r
),
verdicts AS (
  SELECT c.*,
    CASE WHEN c.n_defs = 0 THEN 'MISSING'
         WHEN c.n_defs > 1 THEN 'DUPLICATE'
         WHEN c.live_md5 = c.repo_md5 THEN 'MATCH'
         WHEN c.live_norm = c.repo_norm THEN 'WHITESPACE'
         ELSE 'DIFFERS' END AS verdict
  FROM compared c
),
-- Each marker is a behaviour. Several of them date a definition to one migration.
markers (fname, marker, pattern, meaning) AS (VALUES
  ('alert_ro_status_changed', 'skips Pending Approval', 'NEW\.status <> ''Pending Approval''',
    'without it the walkthrough raises SIX alerts, not five'),
  ('alert_ro_status_changed', 'one emit_alert_event call', 'emit_alert_event', 'more than one changes the count'),
  ('alert_ro_pending_approval', 'fires on Pending Approval', 'NEW\.status = ''Pending Approval''', 'the fourth alert'),
  ('alert_ro_pending_approval', 'emits ro.pending_approval', '''ro\.pending_approval''', 'the event type the route filters on'),
  ('emit_alert_event', 'inserts into alert_events', 'INSERT INTO public\.alert_events', 'the only writer the triggers use'),
  ('emit_alert_event', 'records created_by from auth.uid()', 'auth\.uid\(\)', 'the capture checks created_by'),
  ('record_ro_status_change', 'writes ro_status_events', 'INSERT INTO public\.ro_status_events', 'the row the alert is paired with by xmin'),
  ('record_ro_status_change', 'records old and new status', 'OLD\.status, NEW\.status', 'the transition the capture expects'),
  ('alert_job_assigned', 'membership guard (2026-08-16)', 'shop_users', 'older definitions write alerts nobody can read'),
  ('alert_job_assigned', 'warns when not a member (2026-08-16)', 'RAISE WARNING', 'the same migration'),
  ('alert_job_assigned', 'requires technicians.user_id', 'user_id IS NOT NULL', 'why no job alert can fire in the demo shop'),
  ('alert_job_work_added', 'only for technicians already on the card', 'INTERSECT', 'added 2026-08-16'),
  ('alert_job_work_added', 'not the person who made the edit', 'auth\.uid\(\)', 'added 2026-08-16'),
  ('alert_invoice_paid', 'keys on NEW.number, not NEW.id (fixed 2026-08-16)', 'NEW\.number',
    'NEW.id aborted every attempt to mark an invoice Paid with 42703'),
  ('notify_push_on_alert', 'reads the secret from Vault, not a literal', 'vault|decrypted_secret',
    'a literal here would mean the pre-rotation definition is still live'),
  ('notify_push_on_alert', 'exactly one net.http_post', 'net\.http_post', 'more than one breaks request pairing'),
  ('notify_push_on_alert', 'posts to the production route', '/api/push/send', 'where the request goes')
),
marker_rows AS (
  SELECT m.fname, m.marker, m.meaning,
    (SELECT count(*) FROM live l WHERE l.proname = m.fname) AS n_defs,
    (SELECT l.prosrc ~* m.pattern FROM live l WHERE l.proname = m.fname LIMIT 1) AS present
  FROM markers m
),
-- Triggers on every table the alert path touches, plus the free-tier tables.
trig AS (
  SELECT c.relname::text AS tbl, t.tgname::text AS tgname, t.tgenabled::text AS enabled,
    fn.nspname || '.' || p.proname AS fname,
    CASE WHEN t.tgtype & 2 <> 0 THEN 'BEFORE' WHEN t.tgtype & 64 <> 0 THEN 'INSTEAD' ELSE 'AFTER' END AS timing,
    concat_ws(' OR ',
      CASE WHEN t.tgtype & 4 <> 0 THEN 'INSERT' END,
      CASE WHEN t.tgtype & 16 <> 0 THEN 'UPDATE' END,
      CASE WHEN t.tgtype & 8 <> 0 THEN 'DELETE' END,
      CASE WHEN t.tgtype & 32 <> 0 THEN 'TRUNCATE' END) AS events,
    CASE WHEN t.tgtype & 1 <> 0 THEN 'ROW' ELSE 'STATEMENT' END AS level,
    t.tgqual IS NOT NULL AS has_when
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace cn ON cn.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace fn ON fn.oid = p.pronamespace
  WHERE cn.nspname = 'public' AND NOT t.tgisinternal
    AND c.relname IN ('alert_events', 'audit_events', 'job_cards', 'repair_orders', 'ro_status_events',
                      'standard_labor_guides', 'invoices', 'customers', 'vehicles', 'inspections',
                      'estimates', 'parts_orders')
),
free_tier (tbl) AS (VALUES ('customers'), ('vehicles'), ('job_cards')),

checks (ord, section, object, expected, actual, verdict) AS (
  SELECT v.ord, 'A definition vs repository', 'public.' || v.fname,
    'md5 ' || v.repo_md5,
    CASE WHEN v.n_defs = 0 THEN 'missing'
         WHEN v.n_defs > 1 THEN v.n_defs || ' definitions'
         ELSE 'md5 ' || v.live_md5 || ', ' || v.live_lines || ' lines, owner ' || v.owner
              || CASE WHEN v.secdef THEN ' SECURITY DEFINER' ELSE ' SECURITY INVOKER' END
              || ', config ' || coalesce(nullif(v.config, ''), '(none)')
              || ', acl ' || v.acl END,
    v.verdict
  FROM verdicts v
  UNION ALL
  SELECT 20, 'B semantic markers', 'what each live definition actually does', 'every marker present',
    coalesce((SELECT string_agg(mr.fname || ' | ' || mr.marker || ' | '
                || CASE WHEN mr.n_defs = 0 THEN 'FUNCTION MISSING'
                        WHEN mr.present THEN 'present' ELSE 'ABSENT - ' || mr.meaning END, E'\n'
                ORDER BY mr.fname, mr.marker) FROM marker_rows mr), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM marker_rows WHERE n_defs = 0 OR present IS NOT TRUE) THEN 'DIFFERS' ELSE 'MATCH' END
  UNION ALL
  SELECT 30, 'C age', 'is production older than the repository?', 'no missing 2026-08-16 markers',
    CASE WHEN EXISTS (SELECT 1 FROM marker_rows WHERE n_defs = 0)
         THEN 'MISSING: ' || (SELECT string_agg(DISTINCT fname, ', ' ORDER BY fname) FROM marker_rows WHERE n_defs = 0)
              || ' does not exist here at all'
         WHEN EXISTS (SELECT 1 FROM marker_rows WHERE marker LIKE '%2026-08-16%' AND n_defs = 1 AND present IS NOT TRUE)
         THEN 'OLDER: ' || (SELECT string_agg(fname || ' lacks ' || marker, '; ' ORDER BY fname, marker)
                            FROM marker_rows WHERE marker LIKE '%2026-08-16%' AND n_defs = 1 AND present IS NOT TRUE)
              || ' - those migrations were never applied here'
         WHEN EXISTS (SELECT 1 FROM verdicts WHERE verdict = 'DIFFERS')
         THEN 'DIVERGED: every dated marker is present, but the text differs from the repository; '
              || 'production carries edits that are not in git, or the repository carries edits never applied'
         ELSE 'no evidence of drift from the markers' END,
    CASE WHEN EXISTS (SELECT 1 FROM marker_rows WHERE n_defs = 0 OR present IS NOT TRUE)
           OR EXISTS (SELECT 1 FROM verdicts WHERE verdict <> 'MATCH') THEN 'DIFFERS' ELSE 'MATCH' END
  UNION ALL
  SELECT 40, 'D triggers', 'triggers on the tables the alert path touches', '(record)',
    coalesce((SELECT string_agg(t.tbl || '.' || t.tgname || ' ' || t.enabled || ' ' || t.timing || ' ' || t.events
                || ' ' || t.level || ' -> ' || t.fname || CASE WHEN t.has_when THEN ' WHEN' ELSE '' END, E'\n'
                ORDER BY t.tbl, t.tgname) FROM trig t), '(none)'),
    'RECORD'
  UNION ALL
  SELECT 41, 'D triggers', 'trg_free_tier_limit on customers, vehicles and job_cards', 'present on all three',
    (SELECT string_agg(ft.tbl || '=' || CASE WHEN EXISTS (
        SELECT 1 FROM trig t WHERE t.tbl = ft.tbl AND t.tgname = 'trg_free_tier_limit') THEN 'present' ELSE 'ABSENT' END,
      ', ' ORDER BY ft.tbl) FROM free_tier ft),
    CASE WHEN (SELECT count(*) FROM free_tier ft WHERE EXISTS (
        SELECT 1 FROM trig t WHERE t.tbl = ft.tbl AND t.tgname = 'trg_free_tier_limit')) = 3 THEN 'MATCH' ELSE 'DIFFERS' END
  UNION ALL
  SELECT 42, 'D triggers', 'public.enforce_free_tier_count_limit (what that trigger calls)', 'exactly 1 definition',
    coalesce((SELECT count(*)::text || ' definition(s), owner '
                || string_agg(l.owner, ',') || ', md5 ' || string_agg(l.exact_md5, ',')
              FROM live l WHERE l.proname = 'enforce_free_tier_count_limit'), '0 definitions'),
    CASE WHEN (SELECT count(*) FROM live WHERE proname = 'enforce_free_tier_count_limit') = 1 THEN 'RECORD' ELSE 'DIFFERS' END
  UNION ALL
  SELECT 43, 'D triggers', 'disabled triggers anywhere on those tables (a disabled trigger fires nothing)', 'none',
    coalesce((SELECT string_agg(t.tbl || '.' || t.tgname || ' = ' || t.enabled, ', ' ORDER BY t.tbl, t.tgname)
              FROM trig t WHERE t.enabled <> 'O'), '(none)'),
    CASE WHEN EXISTS (SELECT 1 FROM trig WHERE enabled <> 'O') THEN 'DIFFERS' ELSE 'MATCH' END
  UNION ALL
  SELECT 50, 'E source for diffing', 'public.' || v.fname
    || CASE WHEN v.verdict = 'MATCH' THEN ' (matches; source not repeated)' ELSE '' END,
    'compare against the repository by eye',
    CASE WHEN v.verdict = 'MATCH' THEN '(matches the repository)'
         WHEN v.n_defs = 0 THEN '(missing)'
         WHEN v.looks_sensitive THEN 'WITHHELD: this definition matches a secret-shaped pattern; md5 ' || v.live_md5
         ELSE v.src END,
    CASE WHEN v.verdict = 'MATCH' THEN 'MATCH' ELSE 'RECORD' END
  FROM verdicts v
  UNION ALL
  SELECT 60, 'F push trigger', 'public.notify_push_on_alert (source never printed: it reads the push secret)',
    '1 definition, Vault-backed, one net.http_post',
    coalesce((SELECT count(*)::text || ' definition(s), md5 ' || string_agg(l.exact_md5, ',')
                || ', ' || string_agg(l.src_lines::text, ',') || ' lines, owner ' || string_agg(l.owner, ',')
                || CASE WHEN bool_and(l.prosecdef) THEN ' SECURITY DEFINER' ELSE ' SECURITY INVOKER' END
                || ', acl ' || string_agg(l.acl, ',')
              FROM live l WHERE l.proname = 'notify_push_on_alert'), '0 definitions'),
    CASE WHEN (SELECT count(*) FROM live WHERE proname = 'notify_push_on_alert') = 1 THEN 'RECORD' ELSE 'DIFFERS' END
)
SELECT ord, section, object, expected, actual, verdict FROM checks
UNION ALL
SELECT 999, 'VERDICT', 'objects that do not match the repository', '0',
  (SELECT count(*) FROM checks WHERE verdict IN ('DIFFERS', 'MISSING', 'DUPLICATE', 'WHITESPACE'))::text,
  CASE WHEN EXISTS (SELECT 1 FROM checks WHERE verdict IN ('DIFFERS', 'MISSING', 'DUPLICATE', 'WHITESPACE'))
       THEN 'DIFFERS' ELSE 'MATCH' END
ORDER BY ord;

ROLLBACK;
