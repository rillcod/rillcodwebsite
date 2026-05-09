-- Student-to-teacher direct in-app messaging
CREATE TABLE IF NOT EXISTS student_teacher_threads (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  subject    TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS student_teacher_messages (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES student_teacher_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES portal_users(id),
  body      TEXT NOT NULL,
  sent_at   TIMESTAMPTZ DEFAULT now(),
  is_read   BOOLEAN DEFAULT false
);

ALTER TABLE student_teacher_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_teacher_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "stt_select" ON student_teacher_threads FOR SELECT USING (
    auth.uid() = student_id OR auth.uid() = teacher_id OR
    EXISTS(SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','school'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stt_insert" ON student_teacher_threads FOR INSERT WITH CHECK (
    auth.uid() = student_id OR auth.uid() = teacher_id OR
    EXISTS(SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','school'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stt_delete" ON student_teacher_threads FOR DELETE USING (
    auth.uid() = student_id OR auth.uid() = teacher_id OR
    EXISTS(SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','school'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stm_select" ON student_teacher_messages FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM student_teacher_threads t
      WHERE t.id = thread_id AND (t.student_id = auth.uid() OR t.teacher_id = auth.uid())
    ) OR
    EXISTS(SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','school'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stm_insert" ON student_teacher_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS(
      SELECT 1 FROM student_teacher_threads t
      WHERE t.id = thread_id AND (t.student_id = auth.uid() OR t.teacher_id = auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stm_update" ON student_teacher_messages FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM student_teacher_threads t
      WHERE t.id = thread_id AND (t.student_id = auth.uid() OR t.teacher_id = auth.uid())
    ) OR
    EXISTS(SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','school'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
