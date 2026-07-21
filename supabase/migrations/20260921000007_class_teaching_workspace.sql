-- Canonical Class Teaching Workspace
-- Class + academic term + course owns one active plan. Lessons and delivery use FKs.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_plan_id uuid NULL REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_id uuid NULL REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_term_id uuid NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS curriculum_week_number integer NULL CHECK (curriculum_week_number BETWEEN 1 AND 53);

UPDATE public.lessons l
SET lesson_plan_id = (l.metadata->>'lesson_plan_id')::uuid
WHERE l.lesson_plan_id IS NULL
  AND l.metadata->>'lesson_plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.lesson_plans p WHERE p.id=(l.metadata->>'lesson_plan_id')::uuid);

UPDATE public.lessons l
SET class_id=p.class_id,
    academic_term_id=p.term_id,
    curriculum_week_number=CASE WHEN COALESCE(l.metadata->>'week','') ~ '^\d{1,2}$' THEN (l.metadata->>'week')::integer ELSE NULL END
FROM public.lesson_plans p
WHERE p.id=l.lesson_plan_id
  AND (l.class_id IS NULL OR l.academic_term_id IS NULL OR l.curriculum_week_number IS NULL);

CREATE INDEX IF NOT EXISTS lessons_lesson_plan_id_idx ON public.lessons(lesson_plan_id) WHERE lesson_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lessons_class_term_idx ON public.lessons(class_id,academic_term_id) WHERE class_id IS NOT NULL AND academic_term_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_plans_active_class_term_course_unique
  ON public.lesson_plans(class_id,term_id,course_id)
  WHERE class_id IS NOT NULL AND term_id IS NOT NULL AND course_id IS NOT NULL AND status <> 'archived';

CREATE TABLE IF NOT EXISTS public.class_lesson_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_term_id uuid NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  lesson_id uuid NULL REFERENCES public.lessons(id) ON DELETE SET NULL,
  class_session_id uuid NULL REFERENCES public.class_sessions(id) ON DELETE SET NULL,
  week_number integer NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','delivered','skipped')),
  delivered_at timestamptz NULL,
  delivered_by uuid NULL REFERENCES public.portal_users(id) ON DELETE SET NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_plan_id,week_number,lesson_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS class_lesson_delivery_week_placeholder_unique
  ON public.class_lesson_delivery(lesson_plan_id,week_number)
  WHERE lesson_id IS NULL;

CREATE INDEX IF NOT EXISTS class_lesson_delivery_scope_idx
  ON public.class_lesson_delivery(class_id,academic_term_id,course_id,week_number);

ALTER TABLE public.class_lesson_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_lesson_delivery FROM anon,authenticated;
GRANT SELECT ON public.class_lesson_delivery TO authenticated;
GRANT ALL ON public.class_lesson_delivery TO service_role;

DROP POLICY IF EXISTS class_lesson_delivery_read ON public.class_lesson_delivery;
CREATE POLICY class_lesson_delivery_read ON public.class_lesson_delivery FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.portal_users u WHERE u.id=auth.uid() AND u.role='admin')
  OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id=class_id AND c.teacher_id=auth.uid())
  OR EXISTS (SELECT 1 FROM public.portal_users u WHERE u.id=auth.uid() AND u.role='school' AND u.school_id=(SELECT c.school_id FROM public.classes c WHERE c.id=class_id))
);

CREATE OR REPLACE FUNCTION public.ensure_class_term_teaching_plan(
  p_class_id uuid,
  p_course_id uuid,
  p_academic_term_id uuid,
  p_curriculum_version_id uuid,
  p_actor_id uuid,
  p_sessions_per_week integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_class public.classes%ROWTYPE;
  v_term public.academic_terms%ROWTYPE;
  v_curr public.course_curricula%ROWTYPE;
  v_plan public.lesson_plans%ROWTYPE;
  v_plan_data jsonb := '{}'::jsonb;
  v_created boolean := false;
BEGIN
  IF p_class_id IS NULL OR p_course_id IS NULL OR p_academic_term_id IS NULL THEN
    RAISE EXCEPTION 'class_id, course_id and academic_term_id are required';
  END IF;
  SELECT * INTO v_class FROM public.classes WHERE id=p_class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF v_class.term_id IS DISTINCT FROM p_academic_term_id THEN RAISE EXCEPTION 'Academic term does not match class term'; END IF;
  SELECT * INTO v_term FROM public.academic_terms WHERE id=p_academic_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic term not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id=p_course_id AND (v_class.program_id IS NULL OR c.program_id=v_class.program_id)) THEN
    RAISE EXCEPTION 'Course does not belong to the class programme';
  END IF;
  IF p_curriculum_version_id IS NOT NULL THEN
    SELECT * INTO v_curr FROM public.course_curricula WHERE id=p_curriculum_version_id;
    IF NOT FOUND OR v_curr.course_id IS DISTINCT FROM p_course_id THEN RAISE EXCEPTION 'Curriculum does not belong to the selected course'; END IF;
    IF v_curr.school_id IS NOT NULL AND v_curr.school_id IS DISTINCT FROM v_class.school_id THEN RAISE EXCEPTION 'Curriculum belongs to a different school'; END IF;
    v_plan_data := jsonb_build_object('curriculum_year',1);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_class_id::text||':'||p_academic_term_id::text||':'||p_course_id::text,0));
  SELECT * INTO v_plan FROM public.lesson_plans
  WHERE class_id=p_class_id AND term_id=p_academic_term_id AND course_id=p_course_id AND status<>'archived'
  LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    IF p_curriculum_version_id IS NOT NULL AND v_plan.curriculum_version_id IS DISTINCT FROM p_curriculum_version_id THEN
      UPDATE public.lesson_plans SET curriculum_version_id=p_curriculum_version_id,version=version+1,updated_at=now()
      WHERE id=v_plan.id RETURNING * INTO v_plan;
    END IF;
  ELSE
    INSERT INTO public.lesson_plans(
      class_id,school_id,course_id,term_id,term,term_start,term_end,sessions_per_week,
      curriculum_version_id,plan_data,status,version,created_by,created_at,updated_at
    ) VALUES (
      p_class_id,v_class.school_id,p_course_id,p_academic_term_id,
      v_term.term_label||' '||v_term.academic_year,v_term.start_date,v_term.end_date,
      greatest(COALESCE(p_sessions_per_week,1),1),p_curriculum_version_id,v_plan_data,'draft',1,p_actor_id,now(),now()
    ) RETURNING * INTO v_plan;
    v_created := true;
  END IF;

  RETURN jsonb_build_object('plan_id',v_plan.id,'created',v_created,'curriculum_version_id',v_plan.curriculum_version_id);
END $$;
REVOKE ALL ON FUNCTION public.ensure_class_term_teaching_plan(uuid,uuid,uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_class_term_teaching_plan(uuid,uuid,uuid,uuid,uuid,integer) TO service_role;

CREATE OR REPLACE VIEW public.class_term_teaching_progress AS
SELECT p.id lesson_plan_id,p.class_id,p.term_id academic_term_id,p.course_id,p.curriculum_version_id,
  count(DISTINCT l.id)::integer lesson_count,
  count(DISTINCT d.id) FILTER (WHERE d.status='delivered')::integer delivered_count,
  count(DISTINCT d.week_number) FILTER (WHERE d.status='delivered')::integer delivered_weeks,
  max(d.week_number) FILTER (WHERE d.status='delivered')::integer latest_delivered_week,
  max(d.delivered_at) FILTER (WHERE d.status='delivered') last_delivered_at
FROM public.lesson_plans p
LEFT JOIN public.lessons l ON l.lesson_plan_id=p.id
LEFT JOIN public.class_lesson_delivery d ON d.lesson_plan_id=p.id
WHERE p.status<>'archived'
GROUP BY p.id,p.class_id,p.term_id,p.course_id,p.curriculum_version_id;
GRANT SELECT ON public.class_term_teaching_progress TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.record_class_lesson_delivery(
  p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text,
  p_actor_id uuid, p_notes text DEFAULT NULL, p_class_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_plan public.lesson_plans%ROWTYPE;
  v_delivery public.class_lesson_delivery%ROWTYPE;
  v_term_number integer;
BEGIN
  IF p_week_number NOT BETWEEN 1 AND 53 THEN RAISE EXCEPTION 'Week number must be between 1 and 53'; END IF;
  IF p_status NOT IN ('planned','delivered','skipped') THEN RAISE EXCEPTION 'Invalid delivery status'; END IF;
  SELECT * INTO v_plan FROM public.lesson_plans WHERE id=p_lesson_plan_id AND status<>'archived' FOR UPDATE;
  IF NOT FOUND OR v_plan.class_id IS NULL OR v_plan.term_id IS NULL OR v_plan.course_id IS NULL THEN
    RAISE EXCEPTION 'Canonical class lesson plan not found';
  END IF;
  IF p_lesson_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lessons l WHERE l.id=p_lesson_id AND l.lesson_plan_id=v_plan.id AND l.class_id=v_plan.class_id
  ) THEN RAISE EXCEPTION 'Lesson does not belong to this class plan'; END IF;
  IF p_class_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_sessions s WHERE s.id=p_class_session_id AND s.class_id=v_plan.class_id
  ) THEN RAISE EXCEPTION 'Session does not belong to this class'; END IF;

  IF p_lesson_id IS NULL THEN
    INSERT INTO public.class_lesson_delivery(
      class_id,academic_term_id,course_id,lesson_plan_id,lesson_id,class_session_id,
      week_number,status,delivered_at,delivered_by,notes,updated_at
    ) VALUES (
      v_plan.class_id,v_plan.term_id,v_plan.course_id,v_plan.id,NULL,p_class_session_id,
      p_week_number,p_status,CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      CASE WHEN p_status='delivered' THEN p_actor_id ELSE NULL END,p_notes,now()
    ) ON CONFLICT (lesson_plan_id,week_number) WHERE lesson_id IS NULL DO UPDATE SET
      class_session_id=EXCLUDED.class_session_id,status=EXCLUDED.status,delivered_at=EXCLUDED.delivered_at,
      delivered_by=EXCLUDED.delivered_by,notes=EXCLUDED.notes,updated_at=now()
    RETURNING * INTO v_delivery;
  ELSE
    INSERT INTO public.class_lesson_delivery(
      class_id,academic_term_id,course_id,lesson_plan_id,lesson_id,class_session_id,
      week_number,status,delivered_at,delivered_by,notes,updated_at
    ) VALUES (
      v_plan.class_id,v_plan.term_id,v_plan.course_id,v_plan.id,p_lesson_id,p_class_session_id,
      p_week_number,p_status,CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      CASE WHEN p_status='delivered' THEN p_actor_id ELSE NULL END,p_notes,now()
    ) ON CONFLICT (lesson_plan_id,week_number,lesson_id) DO UPDATE SET
      class_session_id=EXCLUDED.class_session_id,status=EXCLUDED.status,delivered_at=EXCLUDED.delivered_at,
      delivered_by=EXCLUDED.delivered_by,notes=EXCLUDED.notes,updated_at=now()
    RETURNING * INTO v_delivery;
  END IF;

  IF v_plan.curriculum_version_id IS NOT NULL AND v_plan.school_id IS NOT NULL THEN
    SELECT term_number INTO v_term_number FROM public.academic_terms WHERE id=v_plan.term_id;
    INSERT INTO public.curriculum_week_tracking(
      curriculum_id,school_id,class_id,lesson_plan_id,term_number,week_number,status,
      teacher_notes,actual_date,completed_by,completed_at,updated_at
    ) VALUES (
      v_plan.curriculum_version_id,v_plan.school_id,v_plan.class_id,v_plan.id,v_term_number,p_week_number,
      CASE p_status WHEN 'delivered' THEN 'completed' WHEN 'skipped' THEN 'skipped' ELSE 'pending' END,
      p_notes,CASE WHEN p_status='delivered' THEN current_date ELSE NULL END,
      CASE WHEN p_status='delivered' THEN p_actor_id ELSE NULL END,
      CASE WHEN p_status='delivered' THEN now() ELSE NULL END,now()
    ) ON CONFLICT (curriculum_id,school_id,class_id,lesson_plan_id,term_number,week_number)
      WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND lesson_plan_id IS NOT NULL
    DO UPDATE SET status=EXCLUDED.status,teacher_notes=EXCLUDED.teacher_notes,
      actual_date=EXCLUDED.actual_date,completed_by=EXCLUDED.completed_by,
      completed_at=EXCLUDED.completed_at,updated_at=now();
  END IF;
  RETURN to_jsonb(v_delivery);
END $$;
REVOKE ALL ON FUNCTION public.record_class_lesson_delivery(uuid,integer,uuid,text,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_class_lesson_delivery(uuid,integer,uuid,text,uuid,text,uuid) TO service_role;