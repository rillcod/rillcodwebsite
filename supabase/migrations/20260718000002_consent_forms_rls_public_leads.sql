-- ─────────────────────────────────────────────────────────────────────────────
-- consent_forms: add is_public, form_type + full RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE consent_forms
  ADD COLUMN IF NOT EXISTS is_public  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_type  TEXT    DEFAULT 'general'
    CHECK (form_type IN ('registration', 'assessment', 'general'));

ALTER TABLE consent_forms ENABLE ROW LEVEL SECURITY;

-- Staff read their school's forms (admin sees all)
CREATE POLICY "consent_forms_staff_select" ON consent_forms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
        AND role IN ('teacher', 'admin', 'school')
        AND (role = 'admin' OR school_id = consent_forms.school_id)
    )
  );

-- Parents read forms for their school
CREATE POLICY "consent_forms_parent_select" ON consent_forms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
        AND role = 'parent'
        AND school_id = consent_forms.school_id
    )
  );

-- Public forms are readable by everyone (anon included)
CREATE POLICY "consent_forms_public_select" ON consent_forms
  FOR SELECT USING (is_public = true);

-- Staff create forms for their school
CREATE POLICY "consent_forms_staff_insert" ON consent_forms
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
        AND role IN ('teacher', 'admin', 'school')
        AND (role = 'admin' OR school_id = consent_forms.school_id)
    )
  );

-- Staff update forms for their school (e.g. toggle is_public)
CREATE POLICY "consent_forms_staff_update" ON consent_forms
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
        AND role IN ('teacher', 'admin', 'school')
        AND (role = 'admin' OR school_id = consent_forms.school_id)
    )
  );

-- Staff delete forms for their school
CREATE POLICY "consent_forms_staff_delete" ON consent_forms
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid()
        AND role IN ('teacher', 'admin', 'school')
        AND (role = 'admin' OR school_id = consent_forms.school_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- form_leads: anonymous public form submissions
-- school_id     — inherited from the consent form (staff's school)
-- matched_school_id — auto-matched from child_current_school text field
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS form_leads (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id              UUID NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
  school_id            UUID REFERENCES schools(id) ON DELETE SET NULL,
  matched_school_id    UUID REFERENCES schools(id) ON DELETE SET NULL,
  child_current_school TEXT,
  email                TEXT,
  response_data        JSONB NOT NULL DEFAULT '{}',
  submitted_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (form_id, email)
);

ALTER TABLE form_leads ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can submit a lead
CREATE POLICY "form_leads_public_insert" ON form_leads
  FOR INSERT WITH CHECK (true);

-- Staff read leads for their school's forms
CREATE POLICY "form_leads_staff_select" ON form_leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users p
      JOIN  consent_forms cf ON cf.id = form_leads.form_id
      WHERE p.id = auth.uid()
        AND p.role IN ('teacher', 'admin', 'school')
        AND (p.role = 'admin'
             OR cf.school_id = p.school_id
             OR form_leads.school_id = p.school_id)
    )
  );
