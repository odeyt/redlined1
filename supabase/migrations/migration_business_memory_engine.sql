-- SI-9: Business Memory Engine
-- Deterministic pattern memory. No AI. No embeddings.
-- All flags default OFF. Production workflows unchanged.

-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS business_memory_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid        NOT NULL,
  memory_type      text        NOT NULL,
  entity_type      text        NOT NULL,
  entity_id        uuid,
  title            text        NOT NULL,
  summary          text,
  importance       text        NOT NULL DEFAULT 'medium',
  confidence       numeric     NOT NULL DEFAULT 0,
  source_type      text,
  source_id        uuid,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_memory_links (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL,
  memory_item_id      uuid        REFERENCES business_memory_items(id) ON DELETE CASCADE,
  linked_entity_type  text        NOT NULL,
  linked_entity_id    uuid        NOT NULL,
  relationship_type   text        NOT NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_memory_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid        NOT NULL,
  entity_type    text        NOT NULL,
  entity_id      uuid        NOT NULL,
  snapshot_type  text        NOT NULL,
  snapshot_date  date        NOT NULL DEFAULT current_date,
  snapshot       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bmi_shop_id       ON business_memory_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_bmi_memory_type   ON business_memory_items(memory_type);
CREATE INDEX IF NOT EXISTS idx_bmi_entity_type   ON business_memory_items(entity_type);
CREATE INDEX IF NOT EXISTS idx_bmi_entity_id     ON business_memory_items(entity_id);
CREATE INDEX IF NOT EXISTS idx_bmi_importance    ON business_memory_items(importance);
CREATE INDEX IF NOT EXISTS idx_bmi_is_active     ON business_memory_items(is_active);

CREATE INDEX IF NOT EXISTS idx_bml_shop_id            ON business_memory_links(shop_id);
CREATE INDEX IF NOT EXISTS idx_bml_memory_item_id     ON business_memory_links(memory_item_id);
CREATE INDEX IF NOT EXISTS idx_bml_linked_entity_type ON business_memory_links(linked_entity_type);
CREATE INDEX IF NOT EXISTS idx_bml_linked_entity_id   ON business_memory_links(linked_entity_id);

CREATE INDEX IF NOT EXISTS idx_bms_shop_id       ON business_memory_snapshots(shop_id);
CREATE INDEX IF NOT EXISTS idx_bms_entity_type   ON business_memory_snapshots(entity_type);
CREATE INDEX IF NOT EXISTS idx_bms_entity_id     ON business_memory_snapshots(entity_id);
CREATE INDEX IF NOT EXISTS idx_bms_snapshot_date ON business_memory_snapshots(snapshot_date);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE business_memory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memory_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memory_snapshots  ENABLE ROW LEVEL SECURITY;

-- Owner/manager: full read on their shop's memory
CREATE POLICY "owner_manager_read_memory_items" ON business_memory_items
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Technician: read vehicle/job/repair memory only
CREATE POLICY "technician_read_vehicle_memory" ON business_memory_items
  FOR SELECT USING (
    entity_type IN ('vehicle', 'job_card', 'repair_case', 'repair_order')
    AND shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role = 'technician'
    )
  );

-- Service role: full access (for background extraction)
GRANT ALL ON business_memory_items     TO service_role;
GRANT ALL ON business_memory_links     TO service_role;
GRANT ALL ON business_memory_snapshots TO service_role;

-- Owner/manager read memory links
CREATE POLICY "owner_manager_read_memory_links" ON business_memory_links
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Owner/manager read snapshots
CREATE POLICY "owner_manager_read_snapshots" ON business_memory_snapshots
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- ── Feature Flags ─────────────────────────────────────────────

INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('business_memory_engine',         false, 'SI-9: Enable deterministic business memory extraction'),
  ('business_memory_command_center', false, 'SI-9: Show Business Memory section in Command Center'),
  ('entity_memory_panels',           false, 'SI-9: Show memory panels on customer/vehicle/repair detail pages')
ON CONFLICT DO NOTHING;
