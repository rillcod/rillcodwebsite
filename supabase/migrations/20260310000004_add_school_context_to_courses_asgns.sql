-- Add school context to courses and assignments for better multi-tenancy and robust school management
ALTER TABLE courses 
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS school_name TEXT;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS school_name TEXT;

CREATE INDEX IF NOT EXISTS idx_courses_school ON courses(school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_school ON assignments(school_id);

-- Backfill data from teacher's school if possible
UPDATE courses c
SET school_id = p.school_id,
    school_name = p.school_name
FROM portal_users p
WHERE c.teacher_id = p.id
AND c.school_id IS NULL;

UPDATE assignments a
SET school_id = p.school_id,
    school_name = p.school_name
FROM portal_users p
WHERE a.created_by = p.id
AND a.school_id IS NULL;
