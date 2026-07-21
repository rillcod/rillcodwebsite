-- Immutable school report revisions and audit events (audit WP4 / Phase 3).

CREATE TABLE IF NOT EXISTS public.school_report_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.school_performance_reports(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number >= 1),
  status text NOT NULL DEFAULT 'working'
    CHECK (status IN ('working', 'published', 'withdrawn')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative jsonb NOT NULL DEFAULT '{}'::jsonb,
  design jsonb,
  data_sources jsonb,
  created_by uuid NOT NULL REFERENCES public.portal_users(id),
  published_by uuid REFERENCES public.portal_users(id),
  published_at timestamptz,
  change_reason text,
  pdf_hash text,
  force_publish_override jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS school_report_one_working_revision_idx
  ON public.school_report_revisions (report_id)
  WHERE status = 'working';

CREATE INDEX IF NOT EXISTS school_report_revisions_report_status_idx
  ON public.school_report_revisions (report_id, status, revision_number DESC);

CREATE TABLE IF NOT EXISTS public.school_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.school_performance_reports(id) ON DELETE CASCADE,
  revision_id uuid REFERENCES public.school_report_revisions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_report_events_report_idx
  ON public.school_report_events (report_id, created_at DESC);

ALTER TABLE public.school_performance_reports
  ADD COLUMN IF NOT EXISTS working_revision_number integer,
  ADD COLUMN IF NOT EXISTS published_revision_number integer;

-- Idempotent backfill: one revision per existing report.
INSERT INTO public.school_report_revisions (
  report_id,
  revision_number,
  status,
  snapshot,
  narrative,
  design,
  data_sources,
  created_by,
  published_by,
  published_at,
  change_reason
)
SELECT
  r.id,
  1,
  CASE WHEN r.status = 'published' THEN 'published' ELSE 'working' END,
  COALESCE(r.snapshot, '{}'::jsonb),
  COALESCE(r.narrative, '{}'::jsonb),
  r.design,
  r.snapshot->'dataSources',
  r.created_by,
  r.published_by,
  r.published_at,
  CASE WHEN r.status = 'published' THEN 'Backfilled published revision' ELSE 'Backfilled working revision' END
FROM public.school_performance_reports r
WHERE NOT EXISTS (
  SELECT 1 FROM public.school_report_revisions rev WHERE rev.report_id = r.id
);

UPDATE public.school_performance_reports r
SET
  working_revision_number = CASE WHEN r.status = 'published' THEN NULL ELSE 1 END,
  published_revision_number = CASE WHEN r.status = 'published' THEN 1 ELSE NULL END
WHERE r.working_revision_number IS NULL
  AND EXISTS (SELECT 1 FROM public.school_report_revisions rev WHERE rev.report_id = r.id);

INSERT INTO public.school_report_events (report_id, revision_id, event_type, actor_id, payload)
SELECT
  rev.report_id,
  rev.id,
  CASE WHEN rev.status = 'published' THEN 'published' ELSE 'revision_created' END,
  COALESCE(rev.published_by, rev.created_by),
  jsonb_build_object('revision_number', rev.revision_number, 'backfill', true)
FROM public.school_report_revisions rev
WHERE NOT EXISTS (
  SELECT 1 FROM public.school_report_events e
  WHERE e.report_id = rev.report_id AND e.event_type IN ('published', 'revision_created')
);

ALTER TABLE public.school_report_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_report_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.school_report_revisions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.school_report_events FROM anon, authenticated;
GRANT SELECT ON public.school_report_revisions TO authenticated;
GRANT SELECT ON public.school_report_events TO authenticated;
GRANT ALL ON public.school_report_revisions TO service_role;
GRANT ALL ON public.school_report_events TO service_role;

DROP POLICY IF EXISTS school_report_revision_read ON public.school_report_revisions;
CREATE POLICY school_report_revision_read
  ON public.school_report_revisions FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1
      FROM public.school_performance_reports r
      JOIN public.portal_users pu ON pu.id = auth.uid()
      WHERE r.id = report_id
        AND pu.is_active = true
        AND NOT COALESCE(pu.is_deleted, false)
        AND (
          (pu.role = 'school' AND pu.school_id = r.school_id AND status = 'published')
          OR (
            pu.role = 'teacher'
            AND (
              pu.school_id = r.school_id
              OR EXISTS (SELECT 1 FROM public.teacher_schools ts WHERE ts.teacher_id = pu.id AND ts.school_id = r.school_id)
              OR EXISTS (SELECT 1 FROM public.classes c WHERE c.teacher_id = pu.id AND c.school_id = r.school_id)
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS school_report_event_read ON public.school_report_events;
CREATE POLICY school_report_event_read
  ON public.school_report_events FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1
      FROM public.school_performance_reports r
      JOIN public.portal_users pu ON pu.id = auth.uid()
      WHERE r.id = report_id
        AND pu.is_active = true
        AND NOT COALESCE(pu.is_deleted, false)
        AND pu.role IN ('admin', 'teacher')
        AND (
          pu.role = 'admin'
          OR pu.school_id = r.school_id
          OR EXISTS (SELECT 1 FROM public.teacher_schools ts WHERE ts.teacher_id = pu.id AND ts.school_id = r.school_id)
        )
    )
  );

COMMENT ON TABLE public.school_report_revisions IS
  'Immutable published snapshots; working revisions track editable drafts without mutating published history.';
COMMENT ON TABLE public.school_report_events IS
  'Audit trail for publish, unlock, override, regenerate, and delete actions on school report books.';
