-- Recreate views with security_invoker = on so that Postgres enforces the
-- querying user's RLS policies instead of running as the view owner (postgres).
-- This resolves the Supabase Advisor "Security Definer View" warnings on
-- public.finance_ledger and public.student_performance_summary.

CREATE OR REPLACE VIEW public.finance_ledger
  WITH (security_invoker = on) AS
SELECT
    t.id                         AS transaction_id,
    t.created_at                 AS transacted_at,
    t.paid_at                    AS paid_at,
    t.payment_status             AS status,
    t.payment_method             AS method,
    t.amount                     AS amount,
    t.currency                   AS currency,
    t.transaction_reference      AS reference,
    t.receipt_url                AS receipt_url,
    t.school_id                  AS school_id,
    t.portal_user_id             AS portal_user_id,
    i.id                         AS invoice_id,
    i.invoice_number             AS invoice_number,
    i.stream                     AS stream,
    r.id                         AS receipt_id,
    r.receipt_number             AS receipt_number
  FROM public.payment_transactions t
  LEFT JOIN public.invoices i
    ON i.id = t.invoice_id OR i.payment_transaction_id = t.id
  LEFT JOIN public.receipts r ON r.transaction_id = t.id;

COMMENT ON VIEW public.finance_ledger IS
  'Unified read-only ledger joining transactions, invoices & receipts with stream metadata for admin reconciliation.';

GRANT SELECT ON public.finance_ledger TO authenticated;


CREATE OR REPLACE VIEW public.student_performance_summary
  WITH (security_invoker = on) AS
SELECT
    p.id                                                                        AS student_id,
    p.full_name,
    p.school_id,
    count(DISTINCT e.program_id)                                                AS enrolled_programs,
    COALESCE(avg(cs.score), 0::numeric)                                        AS avg_exam_score,
    COALESCE(avg(asub.grade), 0::numeric)                                      AS avg_assignment_grade,
    count(DISTINCT lp.lesson_id) FILTER (WHERE lp.status = 'completed')        AS lessons_completed
  FROM public.portal_users p
  LEFT JOIN public.enrollments e              ON p.id = e.user_id
  LEFT JOIN public.cbt_sessions cs            ON p.id = cs.user_id
    AND cs.status = ANY (ARRAY['passed', 'failed', 'completed'])
  LEFT JOIN public.assignment_submissions asub ON p.id = asub.portal_user_id
    AND asub.status = 'graded'
  LEFT JOIN public.lesson_progress lp         ON p.id = lp.portal_user_id
  WHERE p.role = 'student'
  GROUP BY p.id, p.full_name, p.school_id;
