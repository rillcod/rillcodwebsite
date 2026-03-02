-- Enable RLS on all tables
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;

ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;


-- Example Policies for exams
DROP POLICY IF EXISTS "Exams are viewable by enrolled students or school staff" ON exams;
CREATE POLICY "Exams are viewable by enrolled students or school staff" ON exams FOR SELECT USING (
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school')) OR
  EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.program_id = e.program_id WHERE c.id = exams.course_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view their own exam attempts" ON exam_attempts;
CREATE POLICY "Users can view their own exam attempts" ON exam_attempts FOR SELECT USING (
  portal_user_id = auth.uid() OR
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school'))
);

DROP POLICY IF EXISTS "Users can insert their own exam attempts" ON exam_attempts;
CREATE POLICY "Users can insert their own exam attempts" ON exam_attempts FOR INSERT WITH CHECK (
  portal_user_id = auth.uid()
);

-- Example Policies for files
DROP POLICY IF EXISTS "Files are viewable within the same school" ON files;
CREATE POLICY "Files are viewable within the same school" ON files FOR SELECT USING (
  school_id IN (SELECT school_id FROM portal_users WHERE id = auth.uid()) OR
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin'))
);

DROP POLICY IF EXISTS "Users can insert and delete own files" ON files;
CREATE POLICY "Users can insert and delete own files" ON files FOR ALL USING (
  uploaded_by = auth.uid() OR
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin'))
);

-- Example Policies for payment transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON payment_transactions;
CREATE POLICY "Users can view their own transactions" ON payment_transactions FOR SELECT USING (
  portal_user_id = auth.uid() OR
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND (pu.role = 'admin' OR (pu.role = 'school' AND pu.school_id = payment_transactions.school_id)))
);

-- Policies for Discussion Topics
DROP POLICY IF EXISTS "Anyone enrolled can view topics" ON discussion_topics;
CREATE POLICY "Anyone enrolled can view topics" ON discussion_topics FOR SELECT USING (
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school')) OR
  EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.program_id = e.program_id WHERE c.id = discussion_topics.course_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage own topics" ON discussion_topics;
CREATE POLICY "Users can manage own topics" ON discussion_topics FOR ALL USING (
  created_by = auth.uid() OR
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher'))
);

-- Discussion Replies
DROP POLICY IF EXISTS "Provide access to replies" ON discussion_replies;
CREATE POLICY "Provide access to replies" ON discussion_replies FOR SELECT USING (
  EXISTS(SELECT 1 FROM discussion_topics dt WHERE dt.id = discussion_replies.topic_id)
);

DROP POLICY IF EXISTS "Users can manage own replies" ON discussion_replies;
CREATE POLICY "Users can manage own replies" ON discussion_replies FOR ALL USING (
  created_by = auth.uid() OR
  EXISTS(SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher'))
);
