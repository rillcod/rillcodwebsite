-- Canonical academic-term identity for legacy school invoices.
-- New invoice writes are normalized by the Finance service; this migration
-- attaches existing term-aware school invoices to public.academic_terms.

WITH normalized AS (
  SELECT
    i.id,
    i.metadata,
    CASE
      WHEN COALESCE(i.metadata->>'period_label', '') ~ '^\d{4}/\d{4}$'
        THEN i.metadata->>'period_label'
      WHEN COALESCE(i.metadata->>'academic_year', '') ~ '^\d{4}$'
        THEN (i.metadata->>'academic_year') || '/' || ((i.metadata->>'academic_year')::integer + 1)::text
      WHEN COALESCE(i.metadata->>'academic_year', '') ~ '^\d{4}/\d{4}$'
        THEN i.metadata->>'academic_year'
      ELSE NULL
    END AS period_label,
    CASE
      WHEN COALESCE(i.metadata->>'term_number', '') ~ '^[1-3]$'
        THEN (i.metadata->>'term_number')::integer
      ELSE NULL
    END AS term_number
  FROM public.invoices i
  WHERE i.school_id IS NOT NULL
    AND COALESCE(i.stream, 'school') = 'school'
    AND NOT (COALESCE(i.metadata, '{}'::jsonb) ? 'academic_term_id')
),
matched AS (
  SELECT
    n.id,
    n.metadata,
    t.id AS academic_term_id,
    t.academic_year,
    t.term_label,
    t.term_number
  FROM normalized n
  JOIN public.academic_terms t
    ON t.academic_year = n.period_label
   AND t.term_number = n.term_number
)
UPDATE public.invoices i
SET metadata =
  COALESCE(m.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'academic_term_id', m.academic_term_id,
    'academic_year', split_part(m.academic_year, '/', 1)::integer,
    'period_label', m.academic_year,
    'term_number', m.term_number,
    'term_label', m.academic_year || ' · ' || m.term_label,
    'term_label_short', m.term_label
  ),
  updated_at = COALESCE(i.updated_at, now())
FROM matched m
WHERE i.id = m.id;

CREATE INDEX IF NOT EXISTS invoices_school_academic_term_metadata_idx
  ON public.invoices (school_id, ((metadata->>'academic_term_id')))
  WHERE school_id IS NOT NULL
    AND COALESCE(stream, 'school') = 'school'
    AND status NOT IN ('cancelled', 'void');

COMMENT ON INDEX public.invoices_school_academic_term_metadata_idx IS
  'Speeds canonical school invoice lookup by school and regulated academic term.';
