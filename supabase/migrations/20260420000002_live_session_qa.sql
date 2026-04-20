-- Live Session Q&A / Comments
CREATE TABLE IF NOT EXISTS "public"."live_session_questions" (
    "id"         uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "user_id"    uuid NOT NULL,
    "body"       text NOT NULL,
    "answered"   boolean DEFAULT false,
    "answer"     text,
    "answered_by" uuid,
    "answered_at" timestamp with time zone,
    "upvotes"    integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "live_session_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "live_session_questions_session_fkey"
        FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "live_session_questions_user_fkey"
        FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."live_session_questions" ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read questions for a session
CREATE POLICY "Authenticated users view questions"
    ON "public"."live_session_questions" FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Users can post their own questions
CREATE POLICY "Users post questions"
    ON "public"."live_session_questions" FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can edit/delete their own unanswered questions
CREATE POLICY "Users manage own questions"
    ON "public"."live_session_questions" FOR UPDATE
    USING (user_id = auth.uid());

-- Staff can answer and manage all questions
CREATE POLICY "Staff manage all questions"
    ON "public"."live_session_questions"
    USING (
        EXISTS (
            SELECT 1 FROM "public"."portal_users"
            WHERE id = auth.uid()
              AND role = ANY(ARRAY['admin','teacher'])
        )
    );

-- Index for fast session lookup
CREATE INDEX IF NOT EXISTS "idx_live_session_questions_session"
    ON "public"."live_session_questions" USING btree ("session_id");

GRANT ALL ON TABLE "public"."live_session_questions" TO "anon";
GRANT ALL ON TABLE "public"."live_session_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_questions" TO "service_role";
