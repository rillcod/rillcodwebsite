-- Extend the student-name cascade to the bulk-register archive too. A name
-- correction on the account (portal_users, the identity source of truth — which the
-- consent form authoritatively sets) now also updates the archived credential row's
-- name (registration_results, keyed by login email), so the Records → Registrations
-- tab shows the corrected name as well. Nothing else relies on the archived name, so
-- this is purely cosmetic consistency.
CREATE OR REPLACE FUNCTION public.cascade_student_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student'
     AND NEW.full_name IS DISTINCT FROM OLD.full_name
     AND NEW.full_name IS NOT NULL THEN
    UPDATE public.students
       SET full_name = NEW.full_name, name = NEW.full_name, updated_at = now()
     WHERE user_id = NEW.id
       AND (full_name IS DISTINCT FROM NEW.full_name OR name IS DISTINCT FROM NEW.full_name);

    UPDATE public.student_progress_reports
       SET student_name = NEW.full_name, updated_at = now()
     WHERE student_id = NEW.id
       AND student_name IS DISTINCT FROM NEW.full_name;

    -- Archive row is keyed by the login email.
    IF NEW.email IS NOT NULL THEN
      UPDATE public.registration_results
         SET full_name = NEW.full_name
       WHERE lower(email) = lower(NEW.email)
         AND full_name IS DISTINCT FROM NEW.full_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger already exists (trg_cascade_student_name); CREATE OR REPLACE updates the body.
