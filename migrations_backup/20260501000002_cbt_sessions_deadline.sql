-- Req 2.1: deadline TIMESTAMPTZ populated on session creation from cbt_exams duration

ALTER TABLE cbt_sessions
  ADD COLUMN deadline TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_cbt_session_deadline()
RETURNS TRIGGER AS $$
DECLARE
  exam_duration INTEGER;
BEGIN
  -- Fetch the duration of the exam
  SELECT duration_minutes INTO exam_duration FROM cbt_exams WHERE id = NEW.exam_id;
  
  -- Calculate deadline if duration exists
  IF exam_duration IS NOT NULL THEN
    NEW.deadline := NEW.start_time + (exam_duration * INTERVAL '1 minute');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_cbt_session_deadline
BEFORE INSERT ON cbt_sessions
FOR EACH ROW
EXECUTE FUNCTION set_cbt_session_deadline();
