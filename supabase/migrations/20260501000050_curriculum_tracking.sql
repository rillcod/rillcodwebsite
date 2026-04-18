-- ============================================================
-- Curriculum Week Tracking
-- Tracks lesson delivery progress per school per curriculum
-- ============================================================

CREATE TABLE IF NOT EXISTS curriculum_week_tracking (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  curriculum_id   UUID NOT NULL,
  school_id       UUID,
  term_number     INTEGER NOT NULL CHECK (term_number >= 1),
  week_number     INTEGER NOT NULL CHECK (week_number >= 1),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','skipped')),
  teacher_notes   TEXT,
  actual_date     DATE,
  completed_by    UUID,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Unique per school + term + week (NULL school_id = global/admin tracking)
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_tracking_school_idx
  ON curriculum_week_tracking(curriculum_id, school_id, term_number, week_number)
  WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_tracking_global_idx
  ON curriculum_week_tracking(curriculum_id, term_number, week_number)
  WHERE school_id IS NULL;

-- RLS
ALTER TABLE curriculum_week_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read tracking"
  ON curriculum_week_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin','teacher','school')
    )
  );

CREATE POLICY "Staff can insert tracking"
  ON curriculum_week_tracking FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin','teacher','school')
    )
  );

CREATE POLICY "Staff can update tracking"
  ON curriculum_week_tracking FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin','teacher','school')
    )
  );
