-- One active school report book per school + academic term.
-- Prevents two teachers at the same school from creating conflicting drafts.

-- Keep the newest published (or draft) book per school+term; archive older duplicates.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, academic_term_id
      ORDER BY
        CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
        updated_at DESC NULLS LAST,
        created_at DESC
    ) AS rn
  FROM public.school_performance_reports
  WHERE status IN ('draft', 'published')
    AND academic_term_id IS NOT NULL
)
UPDATE public.school_performance_reports AS r
SET status = 'archived', updated_at = now()
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS school_performance_reports_active_term_uidx
  ON public.school_performance_reports (school_id, academic_term_id)
  WHERE status IN ('draft', 'published')
    AND academic_term_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_school_performance_reports_term
  ON public.school_performance_reports (academic_term_id, school_id);

-- Align read access with class-owner teachers (matches API manage scope).
DROP POLICY IF EXISTS school_report_read_access ON public.school_performance_reports;
CREATE POLICY school_report_read_access
ON public.school_performance_reports
FOR SELECT TO authenticated
USING (
  public.is_active_admin()
  OR EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.id = auth.uid()
      AND pu.is_active = true
      AND COALESCE(pu.is_deleted, false) = false
      AND (
        (pu.role = 'school' AND pu.school_id = school_id AND status = 'published')
        OR (
          pu.role = 'teacher'
          AND (
            pu.school_id = school_id
            OR EXISTS (
              SELECT 1 FROM public.teacher_schools ts
              WHERE ts.teacher_id = pu.id AND ts.school_id = school_id
            )
            OR EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.teacher_id = pu.id AND c.school_id = school_id
            )
          )
        )
      )
  )
);

COMMENT ON INDEX public.school_performance_reports_active_term_uidx IS
  'Ensures one draft or published school report book per school and academic term.';
