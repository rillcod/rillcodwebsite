-- Term-scoped class rosters preserve history when students pause coding for a
-- new term, while still allowing simple reinstatement later.

CREATE TABLE IF NOT EXISTS public.class_term_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'withdrawn', 'completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reinstated_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS class_term_rosters_unique_term
  ON public.class_term_rosters(class_id, student_id, term_id)
  WHERE term_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS class_term_rosters_unique_no_term
  ON public.class_term_rosters(class_id, student_id)
  WHERE term_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_class_status
  ON public.class_term_rosters(class_id, status);

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_student
  ON public.class_term_rosters(student_id);

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_term
  ON public.class_term_rosters(term_id);

DROP TRIGGER IF EXISTS set_class_term_rosters_updated_at ON public.class_term_rosters;
CREATE TRIGGER set_class_term_rosters_updated_at
BEFORE UPDATE ON public.class_term_rosters
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.class_term_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_term_rosters_staff_select ON public.class_term_rosters;
CREATE POLICY class_term_rosters_staff_select
  ON public.class_term_rosters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'admin'
          OR (u.role = 'school' AND u.school_id = class_term_rosters.school_id)
          OR (
            u.role = 'teacher'
            AND (
              EXISTS (
                SELECT 1 FROM public.classes c
                WHERE c.id = class_term_rosters.class_id
                  AND c.teacher_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM public.teacher_schools ts
                WHERE ts.teacher_id = auth.uid()
                  AND ts.school_id = class_term_rosters.school_id
              )
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS class_term_rosters_student_select_own ON public.class_term_rosters;
CREATE POLICY class_term_rosters_student_select_own
  ON public.class_term_rosters FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS class_term_rosters_staff_write ON public.class_term_rosters;
CREATE POLICY class_term_rosters_staff_write
  ON public.class_term_rosters FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'admin'
          OR (
            u.role = 'teacher'
            AND EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.id = class_term_rosters.class_id
                AND c.teacher_id = auth.uid()
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'admin'
          OR (
            u.role = 'teacher'
            AND EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.id = class_term_rosters.class_id
                AND c.teacher_id = auth.uid()
            )
          )
        )
    )
  );

GRANT ALL ON TABLE public.class_term_rosters TO authenticated;
GRANT ALL ON TABLE public.class_term_rosters TO service_role;

-- Backfill active roster rows from the current class pointer. Existing progress
-- reports stay untouched; this only records the current roster snapshot.
INSERT INTO public.class_term_rosters (class_id, student_id, term_id, school_id, program_id, status, started_at)
SELECT
  c.id,
  u.id,
  c.term_id,
  c.school_id,
  c.program_id,
  'active',
  COALESCE(u.created_at, now())
FROM public.portal_users u
JOIN public.classes c ON c.id = u.class_id
WHERE u.role = 'student'
ON CONFLICT DO NOTHING;
