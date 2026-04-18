-- ─────────────────────────────────────────────────────────────────────────────
-- Student Engagement System
-- XP ledger, badges, streaks, project engagement tracking
-- Run this in Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. XP Ledger — every XP event ever earned ────────────────────────────────
CREATE TABLE IF NOT EXISTS student_xp_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  event_key     text NOT NULL,           -- 'assignment_submitted', 'project_submitted', etc.
  event_label   text NOT NULL,           -- human-readable: "Assignment Submitted"
  xp            integer NOT NULL DEFAULT 0,
  ref_id        uuid,                    -- optional: assignment_id, project_id, etc.
  ref_type      text,                    -- 'assignment' | 'project' | 'assessment' | 'attendance' | 'streak'
  term_number   integer,                 -- 1, 2, 3
  school_id     uuid REFERENCES schools(id) ON DELETE SET NULL,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xp_ledger_student_idx ON student_xp_ledger (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xp_ledger_school_idx  ON student_xp_ledger (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xp_ledger_event_idx   ON student_xp_ledger (event_key);

ALTER TABLE student_xp_ledger ENABLE ROW LEVEL SECURITY;

-- Students see only their own XP
CREATE POLICY "Student sees own xp" ON student_xp_ledger
  FOR SELECT USING (student_id = auth.uid());

-- Staff (admin, teacher) can see all XP
CREATE POLICY "Staff can view xp" ON student_xp_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- Only server (service role) inserts XP — no direct student writes
-- (API routes use admin client)

-- ── 2. Student XP Summary — fast lookup per student ─────────────────────────
-- Maintained by triggers on xp_ledger
CREATE TABLE IF NOT EXISTS student_xp_summary (
  student_id    uuid PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  total_xp      integer NOT NULL DEFAULT 0,
  level         integer NOT NULL DEFAULT 1,       -- derived: every 500 XP = 1 level
  this_term_xp  integer NOT NULL DEFAULT 0,
  last_updated  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_xp_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student sees own xp summary" ON student_xp_summary
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Staff sees xp summary" ON student_xp_summary
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- Trigger: upsert summary when XP is inserted
CREATE OR REPLACE FUNCTION update_xp_summary()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  new_total integer;
  new_level integer;
BEGIN
  INSERT INTO student_xp_summary (student_id, total_xp, level, this_term_xp, last_updated)
  VALUES (NEW.student_id, NEW.xp, GREATEST(1, NEW.xp / 500 + 1), NEW.xp, now())
  ON CONFLICT (student_id) DO UPDATE
    SET total_xp     = student_xp_summary.total_xp + NEW.xp,
        level        = GREATEST(1, (student_xp_summary.total_xp + NEW.xp) / 500 + 1),
        this_term_xp = student_xp_summary.this_term_xp + CASE WHEN NEW.term_number IS NOT NULL THEN NEW.xp ELSE 0 END,
        last_updated = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_xp_summary ON student_xp_ledger;
CREATE TRIGGER trg_update_xp_summary
  AFTER INSERT ON student_xp_ledger
  FOR EACH ROW EXECUTE FUNCTION update_xp_summary();

-- ── 3. Student Badges ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_badges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  badge_key     text NOT NULL,           -- e.g. 'first_assignment', 'term_champion'
  badge_label   text NOT NULL,
  badge_icon    text NOT NULL DEFAULT '🏅',
  earned_at     timestamptz NOT NULL DEFAULT now(),
  ref_id        uuid,                    -- what triggered the badge
  school_id     uuid REFERENCES schools(id) ON DELETE SET NULL,
  UNIQUE (student_id, badge_key)         -- can only earn each badge once
);

CREATE INDEX IF NOT EXISTS badges_student_idx ON student_badges (student_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS badges_school_idx  ON student_badges (school_id, earned_at DESC);

ALTER TABLE student_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student sees own badges" ON student_badges
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Staff sees badges" ON student_badges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- ── 4. Student Streaks ────────────────────────────────────────────────────────
-- A "week" is considered active if the student submitted at least one assignment/project
CREATE TABLE IF NOT EXISTS student_streaks (
  student_id       uuid PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  current_streak   integer NOT NULL DEFAULT 0,   -- consecutive active weeks
  longest_streak   integer NOT NULL DEFAULT 0,
  last_active_week date,                          -- Monday of the last active week
  total_active_weeks integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student sees own streak" ON student_streaks
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Staff sees streaks" ON student_streaks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- ── 5. Project Engagement Events ─────────────────────────────────────────────
-- Richer project-specific engagement: views, saves, revisions, showcase flags
CREATE TABLE IF NOT EXISTS project_engagement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  assignment_id uuid,                         -- NULL if standalone project
  event_type    text NOT NULL,                -- 'submitted' | 'revised' | 'showcased' | 'peer_reviewed' | 'teacher_praised'
  score         numeric(5,2),                 -- teacher-assigned score if graded
  is_showcase   boolean DEFAULT false,        -- marked for end-of-term showcase
  has_nigerian_context boolean DEFAULT false, -- used Nigerian real-world example
  used_ai_tools boolean DEFAULT false,        -- used AI in the project
  feedback      text,                         -- teacher feedback text
  school_id     uuid REFERENCES schools(id) ON DELETE SET NULL,
  curriculum_id uuid,                         -- curriculum this was triggered from
  term_number   integer,
  week_number   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proj_eng_student_idx ON project_engagement (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proj_eng_school_idx  ON project_engagement (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proj_eng_showcase_idx ON project_engagement (is_showcase) WHERE is_showcase = true;

ALTER TABLE project_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student sees own project engagement" ON project_engagement
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Staff sees all project engagement" ON project_engagement
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- ── 6. Assignment Engagement Summary ─────────────────────────────────────────
-- Aggregated per student per term — used for grade cap calculation
CREATE TABLE IF NOT EXISTS student_assignment_engagement (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  school_id       uuid REFERENCES schools(id) ON DELETE SET NULL,
  course_id       uuid,
  term_number     integer NOT NULL,
  academic_year   text NOT NULL DEFAULT to_char(now(), 'YYYY'),
  total_assigned  integer NOT NULL DEFAULT 0,
  total_submitted integer NOT NULL DEFAULT 0,
  on_time_count   integer NOT NULL DEFAULT 0,
  late_count      integer NOT NULL DEFAULT 0,
  submission_pct  numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_assigned > 0
    THEN ROUND((total_submitted::numeric / total_assigned) * 100, 2)
    ELSE 100.00 END
  ) STORED,
  last_submission timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id, term_number, academic_year)
);

CREATE INDEX IF NOT EXISTS asgn_eng_student_idx ON student_assignment_engagement (student_id);
CREATE INDEX IF NOT EXISTS asgn_eng_school_idx  ON student_assignment_engagement (school_id);
CREATE INDEX IF NOT EXISTS asgn_eng_pct_idx     ON student_assignment_engagement (submission_pct);

ALTER TABLE student_assignment_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student sees own assignment engagement" ON student_assignment_engagement
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Staff sees assignment engagement" ON student_assignment_engagement
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- ── 7. Showcase Board ─────────────────────────────────────────────────────────
-- Projects/assignments flagged for the end-of-term parent showcase
CREATE TABLE IF NOT EXISTS showcase_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  school_id     uuid REFERENCES schools(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  file_url      text,                           -- R2 URL if uploaded
  thumbnail_url text,
  item_type     text NOT NULL DEFAULT 'project', -- 'project' | 'assignment' | 'assessment'
  assignment_id uuid,
  course_name   text,
  term_number   integer,
  academic_year text NOT NULL DEFAULT to_char(now(), 'YYYY'),
  is_published  boolean NOT NULL DEFAULT false,  -- visible to parents
  is_pinned     boolean NOT NULL DEFAULT false,  -- featured at top
  pinned_by     uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  teacher_note  text,
  views         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS showcase_school_idx    ON showcase_items (school_id, is_published);
CREATE INDEX IF NOT EXISTS showcase_student_idx   ON showcase_items (student_id);
CREATE INDEX IF NOT EXISTS showcase_published_idx ON showcase_items (is_published, is_pinned DESC, created_at DESC);

ALTER TABLE showcase_items ENABLE ROW LEVEL SECURITY;

-- Students see their own items
CREATE POLICY "Student sees own showcase items" ON showcase_items
  FOR SELECT USING (student_id = auth.uid());

-- Staff sees all
CREATE POLICY "Staff manages showcase" ON showcase_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- Parents see published items for their school (join via students table — school_id)
CREATE POLICY "Published showcase visible to school parents" ON showcase_items
  FOR SELECT USING (is_published = true);

-- ── Summary: Tables Created ────────────────────────────────────────────────
-- student_xp_ledger        — every XP earning event
-- student_xp_summary       — fast total XP + level per student (trigger-maintained)
-- student_badges            — badges earned (unique per student+badge_key)
-- student_streaks           — consecutive active weeks tracker
-- project_engagement        — rich project event log
-- student_assignment_engagement — aggregated submission stats per term/course
-- showcase_items            — end-of-term showcase board
