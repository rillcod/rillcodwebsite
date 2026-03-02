-- ============================================================
-- Migration 014: Video conferencing enhancements (Phase 11)
-- Adds advanced live session features: recording, breakout rooms,
-- screen sharing, and live polls/quizzes.
-- ============================================================

-- 1) Extend live_sessions with feature flags
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_breakout_rooms BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_screen_sharing BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_polls BOOLEAN DEFAULT false;

-- 2) Breakout rooms
CREATE TABLE IF NOT EXISTS live_session_breakout_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_participants INTEGER,
  created_by UUID REFERENCES portal_users(id),
  status TEXT CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_breakout_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES live_session_breakout_rooms(id) ON DELETE CASCADE,
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Live polls/quizzes
CREATE TABLE IF NOT EXISTS live_session_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  poll_type TEXT CHECK (poll_type IN ('poll', 'quiz')) DEFAULT 'poll',
  status TEXT CHECK (status IN ('draft', 'live', 'closed')) DEFAULT 'draft',
  allow_multiple BOOLEAN DEFAULT false,
  created_by UUID REFERENCES portal_users(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES live_session_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  order_index INTEGER,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES live_session_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES live_session_poll_options(id) ON DELETE CASCADE,
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_breakout_rooms_session ON live_session_breakout_rooms (session_id);
CREATE INDEX IF NOT EXISTS idx_breakout_participants_room ON live_session_breakout_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_breakout_participants_user ON live_session_breakout_participants (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_polls_session ON live_session_polls (session_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON live_session_poll_options (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON live_session_poll_responses (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_user ON live_session_poll_responses (portal_user_id);

-- 5) RLS enablement
ALTER TABLE live_session_breakout_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_breakout_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_poll_responses ENABLE ROW LEVEL SECURITY;

-- 6) Policies
-- Staff manage breakout rooms and polls
DO $$ BEGIN
  CREATE POLICY "Staff manage breakout rooms" ON live_session_breakout_rooms
    FOR ALL USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
  CREATE POLICY "Staff manage polls" ON live_session_polls
    FOR ALL USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
  CREATE POLICY "Staff manage poll options" ON live_session_poll_options
    FOR ALL USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enrolled students can view rooms/polls for sessions they can access
DO $$ BEGIN
  CREATE POLICY "Enrolled users view breakout rooms" ON live_session_breakout_rooms
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM enrollments
      WHERE user_id = auth.uid()
        AND program_id = (SELECT program_id FROM courses WHERE id = (SELECT course_id FROM live_sessions WHERE id = live_session_breakout_rooms.session_id))
    ));
  CREATE POLICY "Enrolled users view polls" ON live_session_polls
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM enrollments
      WHERE user_id = auth.uid()
        AND program_id = (SELECT program_id FROM courses WHERE id = (SELECT course_id FROM live_sessions WHERE id = live_session_polls.session_id))
    ));
  CREATE POLICY "Enrolled users view poll options" ON live_session_poll_options
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM enrollments e
      JOIN live_session_polls p ON p.id = live_session_poll_options.poll_id
      WHERE e.user_id = auth.uid()
        AND e.program_id = (SELECT program_id FROM courses WHERE id = (SELECT course_id FROM live_sessions WHERE id = p.session_id))
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Participants can manage their own responses
DO $$ BEGIN
  CREATE POLICY "Users respond to polls" ON live_session_poll_responses
    FOR INSERT WITH CHECK (portal_user_id = auth.uid());
  CREATE POLICY "Users view own poll responses" ON live_session_poll_responses
    FOR SELECT USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 7) updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER update_live_session_breakout_rooms_updated_at
    BEFORE UPDATE ON live_session_breakout_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_live_session_polls_updated_at
    BEFORE UPDATE ON live_session_polls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

