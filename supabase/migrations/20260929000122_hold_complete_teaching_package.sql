-- The inverse of release_prepared_week_atomic. Teachers need a safe correction
-- path that withdraws one complete class meeting without deleting learner work.

CREATE OR REPLACE FUNCTION public.hold_prepared_week_atomic(
  p_lesson_plan_id uuid,
  p_week_number integer,
  p_session_number integer,
  p_held_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lessons integer := 0;
  v_assignments integer := 0;
  v_slides integer := 0;
  v_flashcards integer := 0;
BEGIN
  IF p_week_number NOT BETWEEN 1 AND 53 THEN
    RAISE EXCEPTION 'Week number must be between 1 and 53';
  END IF;
  IF p_session_number NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Session number must be between 1 and 20';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.lesson_plans
    WHERE id = p_lesson_plan_id AND status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Teaching plan not found';
  END IF;

  UPDATE public.lessons
  SET status = 'draft', updated_at = p_held_at
  WHERE lesson_plan_id = p_lesson_plan_id
    AND curriculum_week_number = p_week_number
    AND session_number = p_session_number
    AND status = 'active';
  GET DIAGNOSTICS v_lessons = ROW_COUNT;

  UPDATE public.assignments
  SET is_active = false, updated_at = p_held_at
  WHERE lesson_plan_id = p_lesson_plan_id
    AND curriculum_week_number = p_week_number
    AND session_number = p_session_number
    AND is_active = true;
  GET DIAGNOSTICS v_assignments = ROW_COUNT;

  UPDATE public.lesson_materials
  SET is_public = false
  WHERE lesson_plan_id = p_lesson_plan_id
    AND curriculum_week_number = p_week_number
    AND session_number = p_session_number
    AND file_type = 'slide-deck'
    AND is_public = true;
  GET DIAGNOSTICS v_slides = ROW_COUNT;

  UPDATE public.flashcard_decks
  SET is_public = false, updated_at = p_held_at
  WHERE lesson_plan_id = p_lesson_plan_id
    AND curriculum_week_number = p_week_number
    AND session_number = p_session_number
    AND is_public = true;
  GET DIAGNOSTICS v_flashcards = ROW_COUNT;

  RETURN jsonb_build_object(
    'lessons_held', v_lessons,
    'assignments_held', v_assignments,
    'slides_held', v_slides,
    'flashcards_held', v_flashcards
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.hold_prepared_week_atomic(
  uuid, integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hold_prepared_week_atomic(
  uuid, integer, integer, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.hold_prepared_week_atomic(
  uuid, integer, integer, timestamptz
) IS
  'Service-role correction gate for one plan/week/session. Withdraws all five teaching-package assets without deleting submissions, grades or attendance.';
