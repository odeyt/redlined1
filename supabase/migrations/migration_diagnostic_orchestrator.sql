-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnostic Orchestrator Foundation
-- Additive tables only. No existing tables altered or dropped.
-- All flags default OFF. Production workflows unchanged.
-- Uses shop_id for tenancy (matches existing architecture).
-- Apply RLS matching existing tenant patterns.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── diagnostic_sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid        NOT NULL,
  technician_id         uuid        NOT NULL,
  vehicle_id            uuid,
  job_card_id           uuid,
  status                text        NOT NULL DEFAULT 'CASE_CREATED',
  is_simulated          boolean     NOT NULL DEFAULT true,
  vehicle_payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  interface_payload     jsonb,
  confidence_payload    jsonb,
  saved_to_job_card_at  timestamptz,
  schema_version        text        NOT NULL DEFAULT '1.0',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_shop    ON diagnostic_sessions(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_vehicle ON diagnostic_sessions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_job     ON diagnostic_sessions(job_card_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_status  ON diagnostic_sessions(status);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_created ON diagnostic_sessions(created_at);

ALTER TABLE diagnostic_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_sessions_shop_isolation"
  ON diagnostic_sessions FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_modules (ECUs) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_modules (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  name                  text        NOT NULL,
  address               text        NOT NULL,
  protocol              text        NOT NULL,
  supports_obd          boolean     NOT NULL DEFAULT false,
  ecu_id                text,
  software_version      text,
  hardware_version      text,
  calibration_id        text,
  raw_identification    jsonb,
  scanned_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_modules_session ON diagnostic_modules(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_modules_shop    ON diagnostic_modules(shop_id);

ALTER TABLE diagnostic_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_modules_shop_isolation"
  ON diagnostic_modules FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_dtcs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_dtcs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  module_id             uuid        REFERENCES diagnostic_modules(id),
  code                  text        NOT NULL,
  dtc_type              text        NOT NULL DEFAULT 'CONFIRMED',
  dtc_system            text        NOT NULL DEFAULT 'UNKNOWN',
  description           text,
  raw_payload           jsonb,
  scanned_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_dtcs_session ON diagnostic_dtcs(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_dtcs_shop    ON diagnostic_dtcs(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_dtcs_code    ON diagnostic_dtcs(code);

ALTER TABLE diagnostic_dtcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_dtcs_shop_isolation"
  ON diagnostic_dtcs FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_freeze_frames ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_freeze_frames (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  dtc_code              text        NOT NULL,
  module_id             uuid        REFERENCES diagnostic_modules(id),
  parameters            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  raw_payload           text,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_freeze_frames_session ON diagnostic_freeze_frames(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_freeze_frames_shop    ON diagnostic_freeze_frames(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_freeze_frames_code    ON diagnostic_freeze_frames(dtc_code);

ALTER TABLE diagnostic_freeze_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_freeze_frames_shop_isolation"
  ON diagnostic_freeze_frames FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_live_data_captures ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_live_data_captures (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  vehicle_id            uuid,
  label                 text,
  duration_seconds      integer,
  sample_rate_hz        integer,
  test_conditions       text,
  raw_payload           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_live_data_session ON diagnostic_live_data_captures(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_live_data_shop    ON diagnostic_live_data_captures(shop_id);

ALTER TABLE diagnostic_live_data_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_live_data_captures_shop_isolation"
  ON diagnostic_live_data_captures FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_pid_samples ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_pid_samples (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id            uuid        NOT NULL REFERENCES diagnostic_live_data_captures(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  pid                   text        NOT NULL,
  value                 text        NOT NULL,
  unit                  text        NOT NULL,
  timestamp             timestamptz NOT NULL,
  source_module         text        NOT NULL,
  test_conditions       text,
  raw_value             text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_pid_samples_capture ON diagnostic_pid_samples(capture_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_pid_samples_shop    ON diagnostic_pid_samples(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_pid_samples_pid     ON diagnostic_pid_samples(pid);

ALTER TABLE diagnostic_pid_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_pid_samples_shop_isolation"
  ON diagnostic_pid_samples FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_files ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_files (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  file_name             text        NOT NULL,
  file_type             text        NOT NULL,
  file_size_bytes       integer,
  storage_path          text        NOT NULL,
  description           text,
  uploaded_by           uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_files_session ON diagnostic_files(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_files_shop    ON diagnostic_files(shop_id);

ALTER TABLE diagnostic_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_files_shop_isolation"
  ON diagnostic_files FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_evidence ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_evidence (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  source_type           text        NOT NULL,
  source_id             uuid,
  description           text        NOT NULL,
  quality               text        NOT NULL DEFAULT 'UNKNOWN',
  verification_state    text        NOT NULL DEFAULT 'PENDING',
  supports_hypotheses   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  contradicts           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metadata              jsonb,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_evidence_session ON diagnostic_evidence(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_evidence_shop    ON diagnostic_evidence(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_evidence_type    ON diagnostic_evidence(source_type);

ALTER TABLE diagnostic_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_evidence_shop_isolation"
  ON diagnostic_evidence FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_hypotheses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_hypotheses (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id                  uuid        NOT NULL,
  description              text        NOT NULL,
  system_affected          text        NOT NULL,
  component_suspected      text,
  evidence_for             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  evidence_against         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  assumptions_required     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  contradictions           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  confidence_score         integer     NOT NULL DEFAULT 0,
  confidence_band          text        NOT NULL DEFAULT 'WEAK_HYPOTHESIS',
  is_ai_derived            boolean     NOT NULL DEFAULT true,
  is_provisional           boolean     NOT NULL DEFAULT true,
  prerequisite_test_ids    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_hypotheses_session ON diagnostic_hypotheses(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_hypotheses_shop    ON diagnostic_hypotheses(shop_id);

ALTER TABLE diagnostic_hypotheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_hypotheses_shop_isolation"
  ON diagnostic_hypotheses FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_test_plans ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_test_plans (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id                  uuid        NOT NULL,
  title                    text        NOT NULL,
  rationale                text        NOT NULL,
  target_hypothesis_ids    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  required_tools           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  test_conditions          text,
  expected_results         text,
  decision_branches        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  safety_warnings          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes        integer,
  is_ai_derived            boolean     NOT NULL DEFAULT true,
  prerequisites_satisfied  boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_test_plans_session ON diagnostic_test_plans(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_test_plans_shop    ON diagnostic_test_plans(shop_id);

ALTER TABLE diagnostic_test_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_test_plans_shop_isolation"
  ON diagnostic_test_plans FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_test_results ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_test_results (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_plan_id          uuid        NOT NULL REFERENCES diagnostic_test_plans(id),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  technician_id         uuid        NOT NULL,
  outcome               text        NOT NULL,
  measurements          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  notes                 text,
  images_uploaded       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_test_results_session  ON diagnostic_test_results(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_test_results_shop     ON diagnostic_test_results(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_test_results_plan     ON diagnostic_test_results(test_plan_id);

ALTER TABLE diagnostic_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_test_results_shop_isolation"
  ON diagnostic_test_results FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_reasoning_runs (OpenAI primary) ────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_reasoning_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  model_provider        text        NOT NULL,
  model_name            text        NOT NULL,
  prompt_version        text        NOT NULL DEFAULT '1.0',
  engine_version        text        NOT NULL DEFAULT '1.0',
  rules_version         text        NOT NULL DEFAULT '1.0',
  raw_payload           jsonb,              -- preserved for audit, never returned to client
  normalized_payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  schema_version        text        NOT NULL DEFAULT '1.0',
  safety_status         text        NOT NULL DEFAULT 'CLEAR',
  confidence_status     text        NOT NULL DEFAULT 'UNCONFIRMED',
  validated_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reasoning_session ON diagnostic_reasoning_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_reasoning_shop    ON diagnostic_reasoning_runs(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_reasoning_created ON diagnostic_reasoning_runs(created_at);

ALTER TABLE diagnostic_reasoning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_reasoning_runs_shop_isolation"
  ON diagnostic_reasoning_runs FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_reviews (Claude independent review) ────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_reviews (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                 uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id                    uuid        NOT NULL,
  primary_reasoning_id       uuid        REFERENCES diagnostic_reasoning_runs(id),
  model_provider             text        NOT NULL,
  model_name                 text        NOT NULL,
  prompt_version             text        NOT NULL DEFAULT '1.0',
  raw_payload                jsonb,
  normalized_payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  schema_version             text        NOT NULL DEFAULT '1.0',
  agrees_with_primary        boolean,
  severity                   text,
  approval_state             text,
  safety_status              text        NOT NULL DEFAULT 'CLEAR',
  validated_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reviews_session ON diagnostic_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_reviews_shop    ON diagnostic_reviews(shop_id);

ALTER TABLE diagnostic_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_reviews_shop_isolation"
  ON diagnostic_reviews FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_feedback ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_feedback (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id               uuid        NOT NULL,
  technician_id         uuid        NOT NULL,
  target_id             uuid        NOT NULL,
  target_type           text        NOT NULL,
  feedback_type         text        NOT NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_feedback_session ON diagnostic_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_feedback_shop    ON diagnostic_feedback(shop_id);

ALTER TABLE diagnostic_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_feedback_shop_isolation"
  ON diagnostic_feedback FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_repair_verifications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_repair_verifications (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid        NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  shop_id                  uuid        NOT NULL,
  job_card_id              uuid,
  vehicle_id               uuid,
  technician_id            uuid        NOT NULL,
  confirmed_root_cause     text        NOT NULL,
  repair_performed         text        NOT NULL,
  parts_used               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  labor_hours              numeric,
  post_repair_dtcs         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  post_repair_live_data    jsonb,
  complaint_resolved       boolean     NOT NULL,
  verification_notes       text,
  created_as_evidence_id   uuid,
  verified_at              timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_repair_verif_session ON diagnostic_repair_verifications(session_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_repair_verif_shop    ON diagnostic_repair_verifications(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_repair_verif_vehicle ON diagnostic_repair_verifications(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_repair_verif_job     ON diagnostic_repair_verifications(job_card_id);

ALTER TABLE diagnostic_repair_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_repair_verifications_shop_isolation"
  ON diagnostic_repair_verifications FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_bridge_devices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_bridge_devices (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid        NOT NULL,
  display_name          text        NOT NULL,
  machine_id            text        NOT NULL,   -- hashed, no PII
  os_version            text,
  bridge_version        text,
  status                text        NOT NULL DEFAULT 'PENDING',
  last_seen_at          timestamptz,
  paired_at             timestamptz,
  revoked_at            timestamptz,
  revoked_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shop_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_bridge_devices_shop   ON diagnostic_bridge_devices(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_bridge_devices_status ON diagnostic_bridge_devices(status);

-- Bridge devices: only shop owners/admins, not technicians via normal RLS
ALTER TABLE diagnostic_bridge_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_bridge_devices_shop_isolation"
  ON diagnostic_bridge_devices FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── diagnostic_bridge_pairings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_bridge_pairings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid        NOT NULL,
  requested_by_user_id  uuid        NOT NULL,
  pairing_code          text        NOT NULL,   -- short-lived, one-use, hashed at rest
  pairing_code_hash     text        NOT NULL,
  expires_at            timestamptz NOT NULL,
  used_at               timestamptz,
  bridge_device_id      uuid        REFERENCES diagnostic_bridge_devices(id),
  status                text        NOT NULL DEFAULT 'PENDING',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_bridge_pairings_shop   ON diagnostic_bridge_pairings(shop_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_bridge_pairings_status ON diagnostic_bridge_pairings(status);
CREATE INDEX IF NOT EXISTS idx_diagnostic_bridge_pairings_hash   ON diagnostic_bridge_pairings(pairing_code_hash);

ALTER TABLE diagnostic_bridge_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "diagnostic_bridge_pairings_shop_isolation"
  ON diagnostic_bridge_pairings FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── feature flag seeds (all default OFF) ─────────────────────────────────────
INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('diagnostic_orchestrator_enabled', 'Diagnostic Orchestrator', 'Enables the RedlineD1 Diagnostic Orchestrator system. All flags default OFF.', false, 'global'),
  ('diagnostic_bridge_enabled',       'Diagnostic Bridge',        'Enables the Windows J2534 Diagnostic Bridge connection.', false, 'global'),
  ('diagnostic_ai_reasoning_enabled', 'Diagnostic AI Reasoning',  'Enables OpenAI primary reasoning for diagnostic sessions.', false, 'global'),
  ('diagnostic_claude_review_enabled','Diagnostic Claude Review',  'Enables Anthropic Claude independent review of diagnostic AI output.', false, 'global'),
  ('diagnostic_live_hardware_enabled','Diagnostic Live Hardware',  'Enables live J2534 hardware (requires verified driver and device).', false, 'global')
ON CONFLICT (flag_key) DO NOTHING;
