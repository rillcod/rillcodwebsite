-- Project Groups: staff distribute students from the same class into groups,
-- evaluate collectively (group score applied to all) or individually.

CREATE TABLE IF NOT EXISTS project_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  assignment_id   UUID REFERENCES assignments(id) ON DELETE SET NULL,
  class_id        UUID REFERENCES classes(id)     ON DELETE SET NULL,
  class_name      TEXT,
  school_id       UUID REFERENCES schools(id)     ON DELETE SET NULL,
  school_name     TEXT,
  created_by      UUID REFERENCES portal_users(id),
  evaluation_type TEXT NOT NULL DEFAULT 'individual'
                    CHECK (evaluation_type IN ('individual', 'group')),
  -- Shared score when evaluation_type = 'group'
  group_score     NUMERIC(5,2),
  group_feedback  TEXT,
  is_graded       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_group_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES portal_users(id),
  -- Per-member override score (only used when evaluation_type = 'individual')
  individual_score NUMERIC(5,2),
  individual_feedback TEXT,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_groups_assignment ON project_groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_class     ON project_groups(class_id);
CREATE INDEX IF NOT EXISTS idx_pg_members_group         ON project_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_pg_members_student       ON project_group_members(student_id);

-- RLS
ALTER TABLE project_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_group_members ENABLE ROW LEVEL SECURITY;

-- Staff can do everything on project_groups
CREATE POLICY "staff_all_project_groups" ON project_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- Students can read their own group(s)
CREATE POLICY "student_read_own_groups" ON project_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_group_members
      WHERE group_id = project_groups.id AND student_id = auth.uid()
    )
  );

-- Staff can manage members
CREATE POLICY "staff_all_group_members" ON project_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- Students can read members of their own group only (not other groups)
CREATE POLICY "student_read_own_group_members" ON project_group_members
  FOR SELECT USING (
    group_id IN (
      SELECT group_id FROM project_group_members WHERE student_id = auth.uid()
    )
  );
