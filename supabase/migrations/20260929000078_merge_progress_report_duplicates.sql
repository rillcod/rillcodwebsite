-- Align legacy Auto-fill placeholder sessions with canonical academic terms,
-- merge duplicate learner reports on (student_id, term_id, course_id), then
-- enforce one row per student · term · course.
--
-- Score columns are never rewritten. Published rows win over manual, then automatic,
-- then newest updated_at. Child rows on the dropped duplicate are repointed or
-- removed only when they would violate a uniqueness constraint.

-- 1. Normalize placeholder report_term / report_period from academic_terms.
UPDATE public.student_progress_reports spr
SET
  report_term = at.term_label,
  report_period = at.academic_year,
  updated_at = now()
FROM public.academic_terms at
WHERE spr.term_id = at.id
  AND spr.term_id IS NOT NULL
  AND (
    lower(btrim(coalesce(spr.report_term, ''))) IN (
      'current learning period',
      'academic period to be confirmed'
    )
    OR lower(btrim(coalesce(spr.report_period, ''))) IN (
      'current programme',
      'current program',
      'current learning period'
    )
  );

-- 2. Merge duplicate rows that share student_id, term_id and course_id.
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS rn
  FROM public.student_progress_reports
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL
),
merges AS (
  SELECT keep_id, id AS drop_id
  FROM ranked
  WHERE rn > 1
)
DELETE FROM public.academic_result_components arc
USING merges m, public.academic_result_components keeper
WHERE arc.progress_report_id = m.drop_id
  AND keeper.progress_report_id = m.keep_id
  AND keeper.component_key = arc.component_key;

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS rn
  FROM public.student_progress_reports
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL
),
merges AS (
  SELECT keep_id, id AS drop_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.academic_result_components arc
SET progress_report_id = m.keep_id
FROM merges m
WHERE arc.progress_report_id = m.drop_id;

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS rn
  FROM public.student_progress_reports
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL
),
merges AS (
  SELECT keep_id, id AS drop_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.academic_progression_decisions apd
SET progress_report_id = m.keep_id
FROM merges m
WHERE apd.progress_report_id = m.drop_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.academic_progression_decisions existing
    WHERE existing.progress_report_id = m.keep_id
      AND existing.id <> apd.id
  );

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS rn
  FROM public.student_progress_reports
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL
),
merges AS (
  SELECT keep_id, id AS drop_id
  FROM ranked
  WHERE rn > 1
)
DELETE FROM public.certificates c
USING merges m, public.certificates keeper
WHERE c.progress_report_id = m.drop_id
  AND keeper.progress_report_id = m.keep_id
  AND keeper.academic_offering_id IS NOT DISTINCT FROM c.academic_offering_id
  AND keeper.offering_period_id IS NOT DISTINCT FROM c.offering_period_id;

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS rn
  FROM public.student_progress_reports
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL
),
merges AS (
  SELECT keep_id, id AS drop_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.certificates c
SET progress_report_id = m.keep_id
FROM merges m
WHERE c.progress_report_id = m.drop_id;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY student_id, term_id, course_id
      ORDER BY
        (CASE WHEN is_published THEN 1 ELSE 0 END) DESC,
        (CASE WHEN calculation_mode = 'manual' THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    ) AS rn
  FROM public.student_progress_reports
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL
)
DELETE FROM public.student_progress_reports spr
USING ranked r
WHERE spr.id = r.id
  AND r.rn > 1;

-- 3. Stronger uniqueness on course_id (name drift cannot fork twins).
CREATE UNIQUE INDEX IF NOT EXISTS uq_spr_student_term_course_id
  ON public.student_progress_reports (student_id, term_id, course_id)
  WHERE student_id IS NOT NULL
    AND term_id IS NOT NULL
    AND course_id IS NOT NULL;
