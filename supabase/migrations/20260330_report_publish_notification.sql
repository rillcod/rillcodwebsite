-- Migration: Notify parent when a student progress report is published
-- Fires on UPDATE to student_progress_reports when is_published flips to TRUE
-- Looks up the parent via students.parent_email → portal_users.id
-- Inserts an in-app notification for the parent

CREATE OR REPLACE FUNCTION notify_parent_on_report_publish()
RETURNS TRIGGER AS $$
DECLARE
  v_student_name  TEXT;
  v_parent_id     UUID;
  v_action_url    TEXT;
BEGIN
  -- Only act when is_published goes from false/null → true
  IF (NEW.is_published IS TRUE) AND (OLD.is_published IS NOT TRUE) THEN

    -- Resolve student name from portal_users (student_id = portal_users.id)
    SELECT full_name INTO v_student_name
    FROM portal_users
    WHERE id = NEW.student_id
    LIMIT 1;

    -- Find the parent portal_users.id via students.parent_email
    SELECT pu.id INTO v_parent_id
    FROM students s
    JOIN portal_users pu ON pu.email = s.parent_email
    WHERE s.user_id = NEW.student_id
      AND pu.role = 'parent'
    LIMIT 1;

    IF v_parent_id IS NOT NULL THEN
      v_action_url := '/dashboard/parent-results?student=' || NEW.student_id::TEXT;

      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        is_read,
        action_url,
        notification_channel,
        delivery_status,
        created_at,
        updated_at
      ) VALUES (
        v_parent_id,
        'Report Card Published',
        COALESCE(v_student_name, 'Your child') || '''s ' ||
          COALESCE(NEW.report_term, 'term') || ' report card for ' ||
          COALESCE(NEW.course_name, 'a course') || ' has been published.',
        'info',
        false,
        v_action_url,
        'in_app',
        'sent',
        NOW(),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS trg_report_publish_notify ON student_progress_reports;

CREATE TRIGGER trg_report_publish_notify
  AFTER UPDATE ON student_progress_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_parent_on_report_publish();
