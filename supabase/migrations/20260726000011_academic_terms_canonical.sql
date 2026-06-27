-- CANONICAL ACADEMIC YEAR + TERM STRUCTURE
--
-- Before this, "academic year" and "term" were modelled at least four different ways
-- (report_period/report_term text, lesson_plans.term free text, timetables
-- academic_year+term, numeric year_number/term_number on the syllabus spine) and core
-- entities (assignments, classes) had no term anchoring at all. This introduces ONE
-- source of truth and references it from the key entities via a nullable term_id FK.
--
-- Non-destructive: existing text columns are kept and still written; term_id is added
-- alongside and backfilled, so nothing breaks while reads migrate over gradually.

-- ── 1. The canonical table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academic_terms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year text    NOT NULL,                              -- "2025/2026"
  term_number   int     NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  term_label    text    NOT NULL,                              -- "First Term"
  start_date    date,
  end_date      date,
  is_current    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year, term_number)
);

-- Reference data: readable by every authenticated user; writes go through service role.
ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_terms_select_all ON public.academic_terms;
CREATE POLICY academic_terms_select_all ON public.academic_terms FOR SELECT USING (true);

-- ── 2. Seed recent/upcoming sessions (Nigerian Sept–Aug calendar, 3 terms) ────
INSERT INTO public.academic_terms (academic_year, term_number, term_label, start_date, end_date)
SELECT
  y.yr || '/' || (y.yr + 1),
  t.num, t.label,
  CASE t.num WHEN 1 THEN make_date(y.yr, 9, 1)
             WHEN 2 THEN make_date(y.yr + 1, 1, 8)
             ELSE        make_date(y.yr + 1, 4, 30) END,
  CASE t.num WHEN 1 THEN make_date(y.yr, 12, 20)
             WHEN 2 THEN make_date(y.yr + 1, 4, 15)
             ELSE        make_date(y.yr + 1, 8, 5)  END
FROM (SELECT generate_series(2023, 2027) AS yr) y
CROSS JOIN (VALUES (1, 'First Term'), (2, 'Second Term'), (3, 'Third Term')) AS t(num, label)
ON CONFLICT (academic_year, term_number) DO NOTHING;

-- Mark the term that contains today as current.
UPDATE public.academic_terms
   SET is_current = (CURRENT_DATE BETWEEN start_date AND end_date), updated_at = now();

-- ── 3. Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_academic_term() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM public.academic_terms WHERE is_current ORDER BY start_date DESC LIMIT 1;
$$;

-- Find-or-create a term by year + label (1/2/3 or "First/Second/Third Term").
CREATE OR REPLACE FUNCTION public.resolve_academic_term(p_year text, p_term text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_num int;
  v_label text;
  v_id uuid;
BEGIN
  IF p_year IS NULL OR btrim(p_year) = '' THEN RETURN NULL; END IF;
  v_num := CASE
    WHEN p_term ILIKE '%first%'  OR p_term = '1' THEN 1
    WHEN p_term ILIKE '%second%' OR p_term = '2' THEN 2
    WHEN p_term ILIKE '%third%'  OR p_term = '3' THEN 3
    ELSE NULL END;
  IF v_num IS NULL THEN RETURN NULL; END IF;
  v_label := (ARRAY['First Term', 'Second Term', 'Third Term'])[v_num];
  SELECT id INTO v_id FROM public.academic_terms WHERE academic_year = p_year AND term_number = v_num;
  IF v_id IS NULL THEN
    INSERT INTO public.academic_terms (academic_year, term_number, term_label)
    VALUES (p_year, v_num, v_label)
    ON CONFLICT (academic_year, term_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- ── 4. Add nullable term_id FK to the key entities ───────────────────────────
ALTER TABLE public.student_progress_reports ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id);
ALTER TABLE public.lesson_plans             ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id);
ALTER TABLE public.assignments              ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id);
ALTER TABLE public.classes                  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id);
ALTER TABLE public.timetables               ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id);

CREATE INDEX IF NOT EXISTS idx_reports_term_id      ON public.student_progress_reports(term_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_term_id ON public.lesson_plans(term_id);
CREATE INDEX IF NOT EXISTS idx_assignments_term_id  ON public.assignments(term_id);
CREATE INDEX IF NOT EXISTS idx_classes_term_id      ON public.classes(term_id);
CREATE INDEX IF NOT EXISTS idx_timetables_term_id   ON public.timetables(term_id);

-- ── 5. Backfill from existing data ───────────────────────────────────────────
-- Reports: report_period ("2025/2026") + report_term ("First Term").
UPDATE public.student_progress_reports r SET term_id = public.resolve_academic_term(r.report_period, r.report_term)
WHERE r.term_id IS NULL AND r.report_period IS NOT NULL AND r.report_term IS NOT NULL;

-- Lesson plans: term free text like "2025/2026 First Term".
UPDATE public.lesson_plans lp
SET term_id = public.resolve_academic_term(substring(lp.term FROM '(\d{4}/\d{4})'), lp.term)
WHERE lp.term_id IS NULL AND lp.term IS NOT NULL AND lp.term ~ '\d{4}/\d{4}';

-- Timetables: academic_year + term columns.
UPDATE public.timetables tt
SET term_id = public.resolve_academic_term(tt.academic_year, tt.term)
WHERE tt.term_id IS NULL AND tt.academic_year IS NOT NULL AND tt.term IS NOT NULL;

-- Assignments: bucket by due_date into the term whose date range contains it.
UPDATE public.assignments a SET term_id = at.id
FROM public.academic_terms at
WHERE a.term_id IS NULL AND a.due_date IS NOT NULL
  AND a.due_date::date BETWEEN at.start_date AND at.end_date;

-- Classes: bucket by start_date.
UPDATE public.classes c SET term_id = at.id
FROM public.academic_terms at
WHERE c.term_id IS NULL AND c.start_date IS NOT NULL
  AND c.start_date::date BETWEEN at.start_date AND at.end_date;
