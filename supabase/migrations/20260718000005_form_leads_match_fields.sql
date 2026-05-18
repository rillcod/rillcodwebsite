ALTER TABLE form_leads
  ADD COLUMN IF NOT EXISTS match_status       TEXT    DEFAULT 'unreviewed'
    CHECK (match_status IN ('unreviewed', 'pending_review', 'approved', 'rejected', 'new_prospect')),
  ADD COLUMN IF NOT EXISTS match_candidate_id UUID    REFERENCES portal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_confidence   TEXT,
  ADD COLUMN IF NOT EXISTS match_notes        TEXT,
  ADD COLUMN IF NOT EXISTS matched_student_id UUID    REFERENCES portal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_parent_id  UUID    REFERENCES portal_users(id) ON DELETE SET NULL;

-- Index for staff dashboard queries on pending matches
CREATE INDEX IF NOT EXISTS idx_form_leads_match_status ON form_leads (match_status) WHERE match_status = 'pending_review';
