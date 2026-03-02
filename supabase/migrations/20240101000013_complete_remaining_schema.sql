-- ============================================================
-- Migration 013: Complete missing schema tables
-- This ensures the database matches the "remote truth" of 51 tables
-- ============================================================

-- 1. Files table for generic storage
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  uploaded_by UUID REFERENCES portal_users(id),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  storage_provider TEXT CHECK (storage_provider IN ('s3', 'cloudinary')),
  public_url TEXT,
  thumbnail_url TEXT,
  is_virus_scanned BOOLEAN DEFAULT false,
  virus_scan_result TEXT,
  download_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Payment Transactions (supplemental to payments table)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  portal_user_id UUID REFERENCES portal_users(id),
  course_id UUID REFERENCES courses(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  payment_method TEXT CHECK (payment_method IN ('stripe', 'paystack', 'bank_transfer', 'online', 'card', 'cash')),
  payment_status TEXT CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
  transaction_reference TEXT UNIQUE,
  external_transaction_id TEXT,
  payment_gateway_response JSONB,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID REFERENCES portal_users(id),
  course_id UUID REFERENCES courses(id),
  subscription_plan TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  status TEXT CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')) DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  external_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID REFERENCES portal_users(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  assignment_reminders BOOLEAN DEFAULT true,
  grade_notifications BOOLEAN DEFAULT true,
  announcement_notifications BOOLEAN DEFAULT true,
  discussion_replies BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Discussion Topics
CREATE TABLE IF NOT EXISTS discussion_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id),
  created_by UUID REFERENCES portal_users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  upvotes INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Discussion Replies
CREATE TABLE IF NOT EXISTS discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES discussion_topics(id) ON DELETE CASCADE,
  parent_reply_id UUID REFERENCES discussion_replies(id),
  created_by UUID REFERENCES portal_users(id),
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  is_accepted_answer BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Discussion Attachments
CREATE TABLE IF NOT EXISTS discussion_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES discussion_topics(id),
  reply_id UUID REFERENCES discussion_replies(id),
  file_id UUID REFERENCES files(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Content Library
CREATE TABLE IF NOT EXISTS content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  created_by UUID REFERENCES portal_users(id),
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT CHECK (content_type IN ('video', 'document', 'quiz', 'presentation', 'interactive')),
  file_id UUID REFERENCES files(id),
  category TEXT,
  tags TEXT[],
  subject TEXT,
  grade_level TEXT,
  license_type TEXT,
  attribution TEXT,
  version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3,2),
  rating_count INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES portal_users(id),
  approved_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Content Ratings
CREATE TABLE IF NOT EXISTS content_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES content_library(id),
  portal_user_id UUID REFERENCES portal_users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, portal_user_id)
);

-- 10. Live Sessions
CREATE TABLE IF NOT EXISTS live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id),
  instructor_id UUID REFERENCES portal_users(id),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  meeting_url TEXT,
  meeting_id TEXT,
  meeting_password TEXT,
  provider TEXT CHECK (provider IN ('zoom', 'google_meet', 'microsoft_teams')),
  recording_url TEXT,
  status TEXT CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Live Session Attendance
CREATE TABLE IF NOT EXISTS live_session_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_sessions(id),
  portal_user_id UUID REFERENCES portal_users(id),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, portal_user_id)
);

-- 12. Lesson Progress
CREATE TABLE IF NOT EXISTS lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  portal_user_id UUID REFERENCES portal_users(id),
  status TEXT CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  progress_percentage INTEGER DEFAULT 0,
  time_spent_minutes INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_id, portal_user_id)
);

-- RLS Enablement
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

-- Basic Policies
-- Files
DO $$ BEGIN
    CREATE POLICY "Users can view files from their school" ON files FOR SELECT USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND school_id = files.school_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Payments/Subscriptions
DO $$ BEGIN
    CREATE POLICY "Users can view their own transactions" ON payment_transactions FOR SELECT USING (portal_user_id = auth.uid());
    CREATE POLICY "Users can view their own subscriptions" ON subscriptions FOR SELECT USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Discussions
DO $$ BEGIN
    CREATE POLICY "Everyone can view discussions" ON discussion_topics FOR SELECT USING (true);
    CREATE POLICY "Users can create discussions" ON discussion_topics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    CREATE POLICY "Everyone can view replies" ON discussion_replies FOR SELECT USING (true);
    CREATE POLICY "Users can create replies" ON discussion_replies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Content Library
DO $$ BEGIN
    CREATE POLICY "Instructors can view content library" ON content_library FOR SELECT USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Live Sessions
DO $$ BEGIN
    CREATE POLICY "Enrolled students can view live sessions" ON live_sessions FOR SELECT USING (EXISTS (SELECT 1 FROM enrollments WHERE user_id = auth.uid() AND program_id = (SELECT program_id FROM courses WHERE id = live_sessions.course_id)));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Lesson Progress
DO $$ BEGIN
    CREATE POLICY "Users can view their own progress" ON lesson_progress FOR SELECT USING (portal_user_id = auth.uid());
    CREATE POLICY "Users can update their own progress" ON lesson_progress FOR ALL USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Triggers for updated_at
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_discussion_topics_updated_at BEFORE UPDATE ON discussion_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_discussion_replies_updated_at BEFORE UPDATE ON discussion_replies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_content_library_updated_at BEFORE UPDATE ON content_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_live_sessions_updated_at BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lesson_progress_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
