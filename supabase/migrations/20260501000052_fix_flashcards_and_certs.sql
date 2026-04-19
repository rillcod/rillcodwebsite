-- ── Fix 1: update_flashcard_statistics must be SECURITY DEFINER ──────────────
-- Without this, the trigger runs with the student's privileges. Students have
-- no INSERT/UPDATE policy on flashcard_card_statistics, so stats silently
-- never get written.
CREATE OR REPLACE FUNCTION update_flashcard_statistics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.flashcard_card_statistics (
    card_id,
    total_reviews,
    correct_reviews,
    incorrect_reviews
  )
  VALUES (
    NEW.card_id,
    1,
    CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions > OLD.repetitions) THEN 1 ELSE 0 END,
    CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions <= OLD.repetitions) THEN 1 ELSE 0 END
  )
  ON CONFLICT (card_id) DO UPDATE SET
    total_reviews     = flashcard_card_statistics.total_reviews + 1,
    correct_reviews   = flashcard_card_statistics.correct_reviews
                        + CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions > OLD.repetitions) THEN 1 ELSE 0 END,
    incorrect_reviews = flashcard_card_statistics.incorrect_reviews
                        + CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions <= OLD.repetitions) THEN 1 ELSE 0 END,
    last_updated      = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Fix 2: Fire the trigger on INSERT as well as UPDATE ───────────────────────
-- The original trigger was AFTER UPDATE only, so a student's very first review
-- of a card (which creates a new row via INSERT) was never counted.
DROP TRIGGER IF EXISTS trigger_update_flashcard_statistics ON public.flashcard_reviews;
CREATE TRIGGER trigger_update_flashcard_statistics
  AFTER INSERT OR UPDATE ON public.flashcard_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_flashcard_statistics();

-- ── Fix 3: Auto-update updated_at on flashcard tables ─────────────────────────
-- The columns were added in migration 21 but never wired to a trigger,
-- so they stay frozen at the migration timestamp.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_flashcard_cards_updated_at ON public.flashcard_cards;
CREATE TRIGGER trg_flashcard_cards_updated_at
  BEFORE UPDATE ON public.flashcard_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flashcard_decks_updated_at ON public.flashcard_decks;
CREATE TRIGGER trg_flashcard_decks_updated_at
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flashcard_reviews_updated_at ON public.flashcard_reviews;
CREATE TRIGGER trg_flashcard_reviews_updated_at
  BEFORE UPDATE ON public.flashcard_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Fix 4: check_course_completion — handle courses with no CBT exam ──────────
-- The original function returned FALSE when no exam existed for the course,
-- so courses that don't use CBT could never auto-generate a certificate even
-- if all lessons were completed.
-- New rule: if the course has no active exams, lesson completion alone suffices.
CREATE OR REPLACE FUNCTION public.check_course_completion(p_user_id uuid, p_course_id uuid)
RETURNS boolean AS $$
DECLARE
  v_total_lessons     int;
  v_completed_lessons int;
  v_project_count     int;
  v_completed_projects int;
  v_exam_count        int;
  v_has_passed_exam   boolean;
BEGIN
  -- 1. Lessons: Count total published lessons in course
  SELECT count(*) INTO v_total_lessons
  FROM public.lessons
  WHERE course_id = p_course_id AND status = 'published';

  IF v_total_lessons = 0 THEN
    RETURN false;
  END IF;

  -- Count lessons the student has completed
  SELECT count(lp.id) INTO v_completed_lessons
  FROM public.lesson_progress lp
  JOIN public.lessons l ON lp.lesson_id = l.id
  WHERE lp.portal_user_id = p_user_id
    AND l.course_id = p_course_id
    AND lp.status = 'completed';

  IF v_completed_lessons < v_total_lessons THEN
    RETURN false;
  END IF;

  -- 2. Projects: Count mandatory projects for this course
  SELECT count(*) INTO v_project_count
  FROM public.assignments
  WHERE course_id = p_course_id AND assignment_type = 'project' AND is_active = true;

  IF v_project_count > 0 THEN
    -- Check if all projects are submitted (status 'submitted' or 'graded')
    SELECT count(s.id) INTO v_completed_projects
    FROM public.assignment_submissions s
    JOIN public.assignments a ON s.assignment_id = a.id
    WHERE s.portal_user_id = p_user_id
      AND a.course_id = p_course_id
      AND a.assignment_type = 'project'
      AND s.status IN ('submitted', 'graded');
    
    IF v_completed_projects < v_project_count THEN
      RETURN false;
    END IF;
  END IF;

  -- 3. Exams: Check whether this course has any active CBT exams
  SELECT count(*) INTO v_exam_count
  FROM public.cbt_exams
  WHERE course_id = p_course_id AND is_active = true;

  -- No exam configured → lesson & project completion is sufficient
  IF v_exam_count = 0 THEN
    RETURN true;
  END IF;

  -- Exam exists → student must have a passing score
  SELECT EXISTS (
    SELECT 1
    FROM public.cbt_sessions s
    JOIN public.cbt_exams e ON s.exam_id = e.id
    WHERE s.user_id = p_user_id
      AND e.course_id = p_course_id
      AND s.score >= e.passing_score
      AND s.status IN ('completed', 'passed')
  ) INTO v_has_passed_exam;

  RETURN v_has_passed_exam;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Update handle_certificate_trigger to handle assignments ──────────
CREATE OR REPLACE FUNCTION public.handle_certificate_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_course_id uuid;
    v_user_id uuid;
BEGIN
    IF tg_table_name = 'lesson_progress' THEN
        v_user_id := new.portal_user_id;
        SELECT course_id INTO v_course_id FROM public.lessons WHERE id = new.lesson_id;
    ELSIF tg_table_name = 'cbt_sessions' THEN
        v_user_id := new.user_id;
        SELECT course_id INTO v_course_id FROM public.cbt_exams WHERE id = new.exam_id;
    ELSIF tg_table_name = 'assignment_submissions' THEN
        v_user_id := new.portal_user_id;
        SELECT course_id INTO v_course_id FROM public.assignments WHERE id = new.assignment_id;
    END IF;

    IF v_user_id IS NULL OR v_course_id IS NULL THEN
        RETURN new;
    END IF;

    -- check if already has certificate
    IF EXISTS (SELECT 1 FROM public.certificates WHERE portal_user_id = v_user_id AND course_id = v_course_id) THEN
        RETURN new;
    END IF;

    -- check completion
    IF public.check_course_completion(v_user_id, v_course_id) THEN
        INSERT INTO public.certificates (
            portal_user_id,
            course_id,
            certificate_number,
            verification_code,
            issued_date
        ) VALUES (
            v_user_id,
            v_course_id,
            'CERT-' || upper(substring(replace(v_user_id::text, '-', ''), 1, 8)) || '-' || upper(substring(replace(v_course_id::text, '-', ''), 1, 4)),
            upper(substring(gen_random_uuid()::text, 1, 8)),
            current_date
        );
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger for assignment submissions
DROP TRIGGER IF EXISTS tr_check_cert_assignment_submissions ON public.assignment_submissions;
CREATE TRIGGER tr_check_cert_assignment_submissions
    AFTER INSERT OR UPDATE ON public.assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION public.handle_certificate_trigger();
