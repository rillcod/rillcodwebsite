-- Close session-model gaps found in live QA:
-- 1) Backfill null term_id on classes / assignments / timetables / reports
-- 2) Stamp cbt_exams.metadata.term_id for legacy exams
-- 3) Fill missing class.program_id when name clearly matches a programme
--
-- NOTE: student_progress_reports.student_id correctly references portal_users(id)
-- (by schema + RLS). That is intentional dual-ID, not a bug — do not rewrite.

-- ── Helpers ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academic_term_id_for_ts(p_ts timestamptz)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM public.academic_terms
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND (p_ts AT TIME ZONE 'Africa/Lagos')::date BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.live_academic_session_label(p_now date DEFAULT CURRENT_DATE)
RETURNS TABLE(period_label text, term_label text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_month int := EXTRACT(MONTH FROM p_now)::int;
  v_y int := EXTRACT(YEAR FROM p_now)::int;
BEGIN
  IF v_month >= 9 THEN
    period_label := v_y::text || '/' || (v_y + 1)::text;
    term_label := 'First Term';
  ELSIF v_month >= 5 THEN
    period_label := (v_y - 1)::text || '/' || v_y::text;
    term_label := 'Third Term';
  ELSE
    period_label := (v_y - 1)::text || '/' || v_y::text;
    term_label := 'Second Term';
  END IF;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.academic_term_id_for_ts(timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.live_academic_session_label(date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.academic_term_id_for_ts(timestamptz) IS
  'Map a timestamp to academic_terms.id using Lagos-calendar date windows.';
COMMENT ON FUNCTION public.live_academic_session_label(date) IS
  'Calendar live session labels (year + term) matching app liveAcademicSession().';

-- ── 1. Classes: null term_id → created_at window, else live ───────────────────
UPDATE public.classes c
SET term_id = COALESCE(
      public.academic_term_id_for_ts(c.created_at),
      public.live_academic_term_id()
    ),
    updated_at = now()
WHERE c.term_id IS NULL;

-- Classes missing program_id: match common name tokens
UPDATE public.classes c
SET program_id = p.id,
    updated_at = now()
FROM public.programs p
WHERE c.program_id IS NULL
  AND (
    (c.name ILIKE '%Teen Dev%' AND p.name ILIKE '%Teen Developer%')
    OR (c.name ILIKE '%Young Innov%' AND p.name ILIKE '%Young Innovator%')
  );

-- ── 2. Assignments: null term_id → due_date / created_at / live ───────────────
UPDATE public.assignments a
SET term_id = COALESCE(
      public.academic_term_id_for_ts(COALESCE(a.due_date, a.created_at)),
      public.live_academic_term_id()
    ),
    updated_at = now()
WHERE a.term_id IS NULL;

-- ── 3. Timetables: resolve year+term; Annual / odd labels → live term in that year
UPDATE public.timetables tt
SET term_id = COALESCE(
      public.resolve_academic_term(tt.academic_year, tt.term),
      (
        SELECT at.id
        FROM public.academic_terms at
        CROSS JOIN public.live_academic_session_label() live
        WHERE at.academic_year = COALESCE(NULLIF(btrim(tt.academic_year), ''), live.period_label)
          AND at.term_label = live.term_label
        LIMIT 1
      ),
      public.live_academic_term_id()
    )
WHERE tt.term_id IS NULL;

-- ── 4. Progress reports: null term_id → resolve labels, else period+live term
-- Skip rows that would collide with an existing (student, term, course) unique key.
WITH resolved AS (
  SELECT
    r.id,
    COALESCE(
      public.resolve_academic_term(r.report_period, r.report_term),
      (
        SELECT at.id
        FROM public.academic_terms at
        CROSS JOIN public.live_academic_session_label() live
        WHERE at.academic_year = COALESCE(NULLIF(btrim(r.report_period), ''), live.period_label)
          AND at.term_label = live.term_label
        LIMIT 1
      ),
      public.live_academic_term_id()
    ) AS new_term_id,
    r.student_id,
    lower(btrim(COALESCE(r.course_name, ''))) AS course_key
  FROM public.student_progress_reports r
  WHERE r.term_id IS NULL
)
UPDATE public.student_progress_reports r
SET term_id = resolved.new_term_id,
    updated_at = now()
FROM resolved
WHERE r.id = resolved.id
  AND resolved.new_term_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_progress_reports x
    WHERE x.id <> resolved.id
      AND x.student_id = resolved.student_id
      AND x.term_id = resolved.new_term_id
      AND lower(btrim(COALESCE(x.course_name, ''))) = resolved.course_key
  );

-- Orphan null-term reports that already have a canonical twin: drop the empty shell.
DELETE FROM public.student_progress_reports r
WHERE r.term_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.student_progress_reports x
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        public.resolve_academic_term(r.report_period, r.report_term),
        (
          SELECT at.id
          FROM public.academic_terms at
          CROSS JOIN public.live_academic_session_label() live
          WHERE at.academic_year = COALESCE(NULLIF(btrim(r.report_period), ''), live.period_label)
            AND at.term_label = live.term_label
          LIMIT 1
        ),
        public.live_academic_term_id()
      ) AS tid
    ) guess
    WHERE x.student_id = r.student_id
      AND x.term_id = guess.tid
      AND lower(btrim(COALESCE(x.course_name, ''))) = lower(btrim(COALESCE(r.course_name, '')))
  );

-- ── 5. CBT exams: stamp metadata.term_id from start/created date window ───────
UPDATE public.cbt_exams e
SET metadata = COALESCE(e.metadata, '{}'::jsonb) || jsonb_build_object(
      'term_id', COALESCE(
        public.academic_term_id_for_ts(COALESCE(e.start_date, e.created_at)),
        public.live_academic_term_id()
      )::text
    ),
    updated_at = now()
WHERE NULLIF(btrim(COALESCE(e.metadata ->> 'term_id', e.metadata ->> 'academic_term_id', '')), '') IS NULL;

-- Keep is_current aligned.
SELECT public.sync_academic_terms_is_current(CURRENT_DATE);
