-- Report collaboration comments and scheduled readiness notification log.

CREATE TABLE IF NOT EXISTS public.school_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.school_performance_reports(id) ON DELETE CASCADE,
  revision_id uuid REFERENCES public.school_report_revisions(id) ON DELETE SET NULL,
  author_id uuid NOT NULL REFERENCES public.portal_users(id),
  body text NOT NULL CHECK (char_length(trim(body)) >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_report_comments_report_idx
  ON public.school_report_comments (report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.school_report_readiness_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.school_performance_reports(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('ready', 'blocked')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS school_report_readiness_log_report_idx
  ON public.school_report_readiness_log (report_id, checked_at DESC);

ALTER TABLE public.school_report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_report_readiness_log ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.school_report_comments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.school_report_readiness_log FROM anon, authenticated;
GRANT SELECT ON public.school_report_comments TO authenticated;
GRANT SELECT ON public.school_report_readiness_log TO authenticated;
GRANT ALL ON public.school_report_comments TO service_role;
GRANT ALL ON public.school_report_readiness_log TO service_role;

DROP POLICY IF EXISTS school_report_comment_read ON public.school_report_comments;
CREATE POLICY school_report_comment_read
  ON public.school_report_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_performance_reports r
      WHERE r.id = report_id
        AND (
          EXISTS (SELECT 1 FROM public.portal_users u WHERE u.id = auth.uid() AND u.role = 'admin')
          OR EXISTS (
            SELECT 1 FROM public.teacher_schools ts
            WHERE ts.teacher_id = auth.uid() AND ts.school_id = r.school_id
          )
          OR (r.status = 'published' AND EXISTS (
            SELECT 1 FROM public.portal_users u
            WHERE u.id = auth.uid() AND u.role = 'school' AND u.school_id = r.school_id
          ))
        )
    )
  );

DROP POLICY IF EXISTS school_report_readiness_log_read ON public.school_report_readiness_log;
CREATE POLICY school_report_readiness_log_read
  ON public.school_report_readiness_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.portal_users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.teacher_schools ts
      WHERE ts.teacher_id = auth.uid() AND ts.school_id = school_report_readiness_log.school_id
    )
  );

COMMENT ON TABLE public.school_report_comments IS
  'Staff review comments on school performance report books (collaboration workflow).';
COMMENT ON TABLE public.school_report_readiness_log IS
  'Scheduled readiness scan results and notification audit for draft report books.';
