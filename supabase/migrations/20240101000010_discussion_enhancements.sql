-- Discussion Forum Enhancements

-- 1. Flagging system for inappropriate content
CREATE TABLE IF NOT EXISTS flagged_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id),
    reporter_id UUID REFERENCES portal_users(id),
    content_type TEXT NOT NULL CHECK (content_type IN ('topic', 'reply')),
    content_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'removed')),
    moderator_id UUID REFERENCES portal_users(id),
    moderator_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flagged_content_type_id ON flagged_content(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_flagged_status ON flagged_content(status);

-- 2. Topic Subscriptions
CREATE TABLE IF NOT EXISTS topic_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID REFERENCES discussion_topics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(topic_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_subs_topic ON topic_subscriptions(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_subs_user ON topic_subscriptions(user_id);

-- 3. Reputation scoring updates (optional but good for Phase 8)
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 0;

-- 4. RLS for new tables
ALTER TABLE flagged_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Staff can view all flags" ON flagged_content
        FOR SELECT USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can flag content" ON flagged_content
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view their own subscriptions" ON topic_subscriptions
        FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can manage their own subscriptions" ON topic_subscriptions
        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;
