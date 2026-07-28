-- Central academic curriculum governance.
-- Published releases are immutable snapshots. Schools adopt a release; class
-- lesson plans keep the release they started with even after a newer rollout.

CREATE TABLE IF NOT EXISTS public.academic_curriculum_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  source_curriculum_id uuid REFERENCES public.course_curricula(id) ON DELETE SET NULL,
  release_number integer NOT NULL CHECK (release_number > 0),
  title text NOT NULL,
  change_summary text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'retired')),
  published_by uuid NOT NULL REFERENCES public.portal_users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  retired_by uuid REFERENCES public.portal_users(id),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, release_number),
  UNIQUE (course_id, content_hash)
);

CREATE TABLE IF NOT EXISTS public.academic_curriculum_adoptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.academic_curriculum_releases(id) ON DELETE RESTRICT,
  previous_release_id uuid REFERENCES public.academic_curriculum_releases(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'conflict')),
  auto_update boolean NOT NULL DEFAULT true,
  local_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  adopted_by uuid NOT NULL REFERENCES public.portal_users(id),
  adopted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.academic_curriculum_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid REFERENCES public.course_curricula(id) ON DELETE SET NULL,
  release_id uuid REFERENCES public.academic_curriculum_releases(id) ON DELETE SET NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES public.portal_users(id),
  requested_scope text NOT NULL
    CHECK (requested_scope IN ('class', 'school', 'official')),
  title text NOT NULL,
  rationale text NOT NULL,
  changed_paths text[] NOT NULL DEFAULT '{}',
  proposal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_classification text NOT NULL
    CHECK (policy_classification IN ('delivery_safe', 'school_operational', 'academic_core')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('auto_approved', 'pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid REFERENCES public.portal_users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.academic_curriculum_rollout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.academic_curriculum_releases(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  adoption_id uuid REFERENCES public.academic_curriculum_adoptions(id) ON DELETE SET NULL,
  previous_release_id uuid REFERENCES public.academic_curriculum_releases(id) ON DELETE SET NULL,
  status text NOT NULL
    CHECK (status IN ('applied', 'skipped', 'conflict', 'rolled_back')),
  reason text,
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NOT NULL REFERENCES public.portal_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_plans
  ADD COLUMN IF NOT EXISTS curriculum_release_id uuid
  REFERENCES public.academic_curriculum_releases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_academic_curriculum_releases_course
  ON public.academic_curriculum_releases(course_id, status, release_number DESC);
CREATE INDEX IF NOT EXISTS idx_academic_curriculum_adoptions_release
  ON public.academic_curriculum_adoptions(release_id);
CREATE INDEX IF NOT EXISTS idx_academic_curriculum_proposals_queue
  ON public.academic_curriculum_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_curriculum_proposals_owner
  ON public.academic_curriculum_proposals(proposed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_curriculum_rollout_release
  ON public.academic_curriculum_rollout_events(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_curriculum_release
  ON public.lesson_plans(curriculum_release_id);

ALTER TABLE public.academic_curriculum_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_curriculum_adoptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_curriculum_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_curriculum_rollout_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_releases_staff_read ON public.academic_curriculum_releases;
CREATE POLICY academic_releases_staff_read
  ON public.academic_curriculum_releases FOR SELECT TO authenticated
  USING (public.is_staff());
DROP POLICY IF EXISTS academic_releases_admin_manage ON public.academic_curriculum_releases;
CREATE POLICY academic_releases_admin_manage
  ON public.academic_curriculum_releases FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS academic_adoptions_scoped_read ON public.academic_curriculum_adoptions;
CREATE POLICY academic_adoptions_scoped_read
  ON public.academic_curriculum_adoptions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.school_id = academic_curriculum_adoptions.school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_schools ts
      WHERE ts.teacher_id = auth.uid() AND ts.school_id = academic_curriculum_adoptions.school_id
    )
  );
DROP POLICY IF EXISTS academic_adoptions_admin_manage ON public.academic_curriculum_adoptions;
CREATE POLICY academic_adoptions_admin_manage
  ON public.academic_curriculum_adoptions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS academic_proposals_scoped_read ON public.academic_curriculum_proposals;
CREATE POLICY academic_proposals_scoped_read
  ON public.academic_curriculum_proposals FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR proposed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.school_id = academic_curriculum_proposals.school_id
    )
  );
DROP POLICY IF EXISTS academic_proposals_staff_insert ON public.academic_curriculum_proposals;
CREATE POLICY academic_proposals_staff_insert
  ON public.academic_curriculum_proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND proposed_by = auth.uid());
DROP POLICY IF EXISTS academic_proposals_owner_withdraw ON public.academic_curriculum_proposals;
CREATE POLICY academic_proposals_owner_withdraw
  ON public.academic_curriculum_proposals FOR UPDATE TO authenticated
  USING (proposed_by = auth.uid() OR public.is_admin())
  WITH CHECK (proposed_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS academic_rollouts_scoped_read ON public.academic_curriculum_rollout_events;
CREATE POLICY academic_rollouts_scoped_read
  ON public.academic_curriculum_rollout_events FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.school_id = academic_curriculum_rollout_events.school_id
    )
  );
DROP POLICY IF EXISTS academic_rollouts_admin_manage ON public.academic_curriculum_rollout_events;
CREATE POLICY academic_rollouts_admin_manage
  ON public.academic_curriculum_rollout_events FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.academic_curriculum_releases TO authenticated;
GRANT SELECT ON public.academic_curriculum_adoptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.academic_curriculum_proposals TO authenticated;
GRANT SELECT ON public.academic_curriculum_rollout_events TO authenticated;
GRANT ALL ON public.academic_curriculum_releases TO service_role;
GRANT ALL ON public.academic_curriculum_adoptions TO service_role;
GRANT ALL ON public.academic_curriculum_proposals TO service_role;
GRANT ALL ON public.academic_curriculum_rollout_events TO service_role;

COMMENT ON TABLE public.academic_curriculum_releases IS
  'Immutable, sourced, admin-published curriculum snapshots.';
COMMENT ON TABLE public.academic_curriculum_adoptions IS
  'The currently adopted official release for each school and course.';
COMMENT ON COLUMN public.lesson_plans.curriculum_release_id IS
  'Immutable official release used to seed this class-term plan.';
