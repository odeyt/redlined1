-- SI-12: Intelligent Service Advisor — Database Migration
-- Additive only. Idempotent. Full RLS. All flags default OFF.

-- ── TABLE: service_advisor_sessions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_advisor_sessions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                   uuid        NOT NULL,
  customer_id               uuid        NULL,
  vehicle_id                uuid        NULL,
  job_card_id               uuid        NULL,
  estimate_id               uuid        NULL,
  session_status            text        NOT NULL DEFAULT 'draft',
  context_snapshot          jsonb       NOT NULL DEFAULT '{}',
  estimate_quality_score    integer     NULL,
  approval_opportunity_score integer    NULL,
  advisor_summary           text        NULL,
  metadata                  jsonb       NOT NULL DEFAULT '{}',
  created_by                uuid        NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz NULL
);

ALTER TABLE service_advisor_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sas_shop_id        ON service_advisor_sessions (shop_id);
CREATE INDEX IF NOT EXISTS idx_sas_customer_id    ON service_advisor_sessions (customer_id);
CREATE INDEX IF NOT EXISTS idx_sas_vehicle_id     ON service_advisor_sessions (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sas_job_card_id    ON service_advisor_sessions (job_card_id);
CREATE INDEX IF NOT EXISTS idx_sas_estimate_id    ON service_advisor_sessions (estimate_id);
CREATE INDEX IF NOT EXISTS idx_sas_session_status ON service_advisor_sessions (session_status);
CREATE INDEX IF NOT EXISTS idx_sas_created_at     ON service_advisor_sessions (created_at);

-- ── TABLE: service_advisor_suggestions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_advisor_suggestions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL,
  advisor_session_id  uuid        NULL REFERENCES service_advisor_sessions(id) ON DELETE CASCADE,
  suggestion_type     text        NOT NULL,
  suggestion_key      text        NOT NULL,
  priority            text        NOT NULL DEFAULT 'medium',
  title               text        NOT NULL,
  explanation         text        NULL,
  reason              text        NULL,
  estimated_revenue   numeric     NULL,
  confidence          numeric     NOT NULL DEFAULT 0,
  evidence            jsonb       NOT NULL DEFAULT '[]',
  source_entity_type  text        NULL,
  source_entity_id    uuid        NULL,
  action_type         text        NULL,
  action_payload      jsonb       NOT NULL DEFAULT '{}',
  status              text        NOT NULL DEFAULT 'open',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz NULL,
  dismissed_at        timestamptz NULL
);

ALTER TABLE service_advisor_suggestions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sass_shop_id           ON service_advisor_suggestions (shop_id);
CREATE INDEX IF NOT EXISTS idx_sass_advisor_session   ON service_advisor_suggestions (advisor_session_id);
CREATE INDEX IF NOT EXISTS idx_sass_suggestion_type   ON service_advisor_suggestions (suggestion_type);
CREATE INDEX IF NOT EXISTS idx_sass_status            ON service_advisor_suggestions (status);
CREATE INDEX IF NOT EXISTS idx_sass_created_at        ON service_advisor_suggestions (created_at);

-- ── TABLE: service_advisor_outcomes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_advisor_outcomes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL,
  advisor_session_id  uuid        NULL REFERENCES service_advisor_sessions(id) ON DELETE CASCADE,
  estimate_id         uuid        NULL,
  suggestion_id       uuid        NULL REFERENCES service_advisor_suggestions(id) ON DELETE SET NULL,
  outcome_type        text        NOT NULL,
  accepted            boolean     NULL,
  estimate_approved   boolean     NULL,
  realized_revenue    numeric     NULL,
  customer_response   text        NULL,
  recorded_by         uuid        NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_advisor_outcomes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sao_shop_id           ON service_advisor_outcomes (shop_id);
CREATE INDEX IF NOT EXISTS idx_sao_advisor_session   ON service_advisor_outcomes (advisor_session_id);
CREATE INDEX IF NOT EXISTS idx_sao_estimate_id       ON service_advisor_outcomes (estimate_id);
CREATE INDEX IF NOT EXISTS idx_sao_outcome_type      ON service_advisor_outcomes (outcome_type);
CREATE INDEX IF NOT EXISTS idx_sao_created_at        ON service_advisor_outcomes (created_at);

-- ── TABLE: advisor_templates ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS advisor_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid        NULL,
  template_key   text        NOT NULL,
  template_type  text        NOT NULL,
  name           text        NOT NULL,
  content        text        NOT NULL,
  language       text        NOT NULL DEFAULT 'en',
  is_system      boolean     NOT NULL DEFAULT false,
  is_active      boolean     NOT NULL DEFAULT true,
  metadata       jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advisor_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_at_shop_id       ON advisor_templates (shop_id);
CREATE INDEX IF NOT EXISTS idx_at_template_key  ON advisor_templates (template_key);
CREATE INDEX IF NOT EXISTS idx_at_template_type ON advisor_templates (template_type);
CREATE INDEX IF NOT EXISTS idx_at_language      ON advisor_templates (language);
CREATE INDEX IF NOT EXISTS idx_at_is_active     ON advisor_templates (is_active);

-- ── RLS: service_advisor_sessions ────────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_sas_select" ON service_advisor_sessions;
CREATE POLICY "owner_manager_sas_select"
  ON service_advisor_sessions FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "owner_manager_sas_insert" ON service_advisor_sessions;
CREATE POLICY "owner_manager_sas_insert"
  ON service_advisor_sessions FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "owner_manager_sas_update" ON service_advisor_sessions;
CREATE POLICY "owner_manager_sas_update"
  ON service_advisor_sessions FOR UPDATE
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "service_sas_all" ON service_advisor_sessions;
CREATE POLICY "service_sas_all"
  ON service_advisor_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── RLS: service_advisor_suggestions ─────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_sass_select" ON service_advisor_suggestions;
CREATE POLICY "owner_manager_sass_select"
  ON service_advisor_suggestions FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "owner_manager_sass_insert" ON service_advisor_suggestions;
CREATE POLICY "owner_manager_sass_insert"
  ON service_advisor_suggestions FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "owner_manager_sass_update" ON service_advisor_suggestions;
CREATE POLICY "owner_manager_sass_update"
  ON service_advisor_suggestions FOR UPDATE
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "service_sass_all" ON service_advisor_suggestions;
CREATE POLICY "service_sass_all"
  ON service_advisor_suggestions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── RLS: service_advisor_outcomes ────────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_sao_select" ON service_advisor_outcomes;
CREATE POLICY "owner_manager_sao_select"
  ON service_advisor_outcomes FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "owner_manager_sao_insert" ON service_advisor_outcomes;
CREATE POLICY "owner_manager_sao_insert"
  ON service_advisor_outcomes FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "service_sao_all" ON service_advisor_outcomes;
CREATE POLICY "service_sao_all"
  ON service_advisor_outcomes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── RLS: advisor_templates ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_at_select" ON advisor_templates;
CREATE POLICY "owner_manager_at_select"
  ON advisor_templates FOR SELECT
  USING (
    shop_id IS NULL OR
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
    )
  );

DROP POLICY IF EXISTS "owner_at_insert" ON advisor_templates;
CREATE POLICY "owner_at_insert"
  ON advisor_templates FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "owner_at_update" ON advisor_templates;
CREATE POLICY "owner_at_update"
  ON advisor_templates FOR UPDATE
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "service_at_all" ON advisor_templates;
CREATE POLICY "service_at_all"
  ON advisor_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT ALL ON TABLE service_advisor_sessions    TO service_role, authenticated;
GRANT ALL ON TABLE service_advisor_suggestions TO service_role, authenticated;
GRANT ALL ON TABLE service_advisor_outcomes    TO service_role, authenticated;
GRANT ALL ON TABLE advisor_templates           TO service_role, authenticated;

-- ── Feature Flags (all OFF) ───────────────────────────────────────────────────

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('intelligent_service_advisor',         'Intelligent Service Advisor',           'SI-12: Enable intelligent service advisor engine',                       false, 'global'),
  ('service_advisor_estimate_panel',      'Service Advisor Estimate Panel',        'SI-12: Show advisor panel on estimate pages',                            false, 'global'),
  ('service_advisor_customer_explanations','Service Advisor Customer Explanations','SI-12: Enable deterministic customer explanation builder',               false, 'global'),
  ('service_advisor_related_services',    'Service Advisor Related Services',      'SI-12: Enable ethical related-service suggestions',                      false, 'global'),
  ('service_advisor_follow_up',           'Service Advisor Follow-Up',             'SI-12: Enable estimate follow-up intelligence',                          false, 'global'),
  ('service_advisor_command_center',      'Service Advisor Command Center',        'SI-12: Show service advisor opportunities in Command Center',            false, 'global'),
  ('service_advisor_outcome_tracking',    'Service Advisor Outcome Tracking',      'SI-12: Enable outcome recording for learning integration',               false, 'global'),
  ('service_advisor_sapelee_enhancement', 'Service Advisor Sapelee Enhancement',   'SI-12: Future Sapelee reasoning enhancement (unimplemented — keep OFF)', false, 'global')
ON CONFLICT DO NOTHING;

-- ── System Templates ──────────────────────────────────────────────────────────

INSERT INTO advisor_templates (template_key, template_type, name, content, language, is_system, is_active)
VALUES
  ('repair_overview_en',    'estimate_overview',    'Estimate Overview (EN)',         'We inspected your {year} {make} {model} and found the following items that need attention. {finding_summary}', 'en', true, true),
  ('finding_explanation_en','finding_explanation',  'Finding Explanation (EN)',       '{finding_name}: {what_was_found}. This matters because {why_it_matters}. We recommend {recommendation}.', 'en', true, true),
  ('safety_finding_en',     'safety_explanation',   'Safety Finding (EN)',            'Safety Item — {finding_name}: {description}. This affects vehicle safety. We strongly recommend addressing this before your next drive.', 'en', true, true),
  ('declined_work_en',      'declined_work',        'Declined Work Reminder (EN)',    'During a previous visit on {prior_date}, we recommended {service_name}. This item was noted as declined. The concern may still apply — please let us know if you would like to revisit this.', 'en', true, true),
  ('repair_overview_lo',    'estimate_overview',    'Estimate Overview (Lao)',        '[LAO PLACEHOLDER] ທ່ານ{year} {make} {model} {finding_summary}', 'lo', true, false),
  ('finding_explanation_lo','finding_explanation',  'Finding Explanation (Lao)',      '[LAO PLACEHOLDER] {finding_name}: {what_was_found}', 'lo', true, false)
ON CONFLICT DO NOTHING;
