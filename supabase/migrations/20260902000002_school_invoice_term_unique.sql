-- Enforce one active partner-school invoice per school + academic year + term.
-- Cancelled/void invoices are excluded so a term can be re-issued after cleanup.

CREATE UNIQUE INDEX IF NOT EXISTS invoices_school_term_active_uidx
  ON public.invoices (
    school_id,
    ((metadata ->> 'academic_year')),
    ((metadata ->> 'term_number'))
  )
  WHERE stream = 'school'
    AND school_id IS NOT NULL
    AND status IS DISTINCT FROM 'cancelled'
    AND status IS DISTINCT FROM 'void'
    AND (metadata ->> 'academic_year') IS NOT NULL
    AND (metadata ->> 'term_number') IS NOT NULL;
