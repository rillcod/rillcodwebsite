-- ─────────────────────────────────────────────────────────────────────────────
-- CRM: Customer Retention System
-- Run this in Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Interaction / communication log (manual notes, calls, emails, meetings)
CREATE TABLE IF NOT EXISTS crm_interactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    text NOT NULL,                       -- portal_users.id or WA conversation id
  contact_type  text NOT NULL DEFAULT 'portal_user', -- 'portal_user' | 'school' | 'external'
  contact_name  text NOT NULL,
  type          text NOT NULL DEFAULT 'note',         -- 'note' | 'call' | 'email' | 'meeting' | 'whatsapp'
  direction     text NOT NULL DEFAULT 'outbound',     -- 'inbound' | 'outbound'
  content       text NOT NULL,
  staff_id      uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  staff_name    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_interactions_contact_idx ON crm_interactions (contact_id);
CREATE INDEX IF NOT EXISTS crm_interactions_created_idx ON crm_interactions (created_at DESC);

-- Enable RLS
ALTER TABLE crm_interactions ENABLE ROW LEVEL SECURITY;

-- Staff (admin, teacher, school role) can read/write all interactions
CREATE POLICY "Staff can manage crm_interactions"
  ON crm_interactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'teacher', 'school')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'teacher', 'school')
      AND is_active = true
    )
  );


-- 2. Document attachments per contact (stored in Cloudflare R2)
CREATE TABLE IF NOT EXISTS crm_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        text NOT NULL,
  contact_type      text NOT NULL DEFAULT 'portal_user',
  contact_name      text NOT NULL,
  file_name         text NOT NULL,
  file_key          text NOT NULL,                   -- R2 storage key
  file_type         text,                             -- MIME type
  file_size         int,                              -- bytes
  uploaded_by       uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  uploaded_by_name  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_attachments_contact_idx ON crm_attachments (contact_id);

ALTER TABLE crm_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage crm_attachments"
  ON crm_attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'teacher', 'school')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'teacher', 'school')
      AND is_active = true
    )
  );


-- 3. Pipeline / retention stage per contact
CREATE TABLE IF NOT EXISTS crm_pipeline (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        text NOT NULL UNIQUE,             -- one stage per contact
  contact_type      text NOT NULL DEFAULT 'portal_user',
  contact_name      text,
  stage             text NOT NULL DEFAULT 'active',   -- 'prospect' | 'active' | 'at_risk' | 'churned' | 'won'
  pipeline_notes    text,
  updated_by        uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  updated_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_pipeline_contact_idx ON crm_pipeline (contact_id);
CREATE INDEX IF NOT EXISTS crm_pipeline_stage_idx   ON crm_pipeline (stage);

ALTER TABLE crm_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage crm_pipeline"
  ON crm_pipeline FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'teacher', 'school')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
      AND role IN ('admin', 'teacher', 'school')
      AND is_active = true
    )
  );
