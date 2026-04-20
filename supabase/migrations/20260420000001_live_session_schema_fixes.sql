-- ============================================================
-- Live Session Schema Fixes
-- 1. Add missing FK constraints (session_id on attendance,
--    polls, and breakout_rooms → live_sessions)
-- 2. Add missing RLS policies for live_session_attendance
--    and live_session_breakout_participants
-- 3. Add staff SELECT policy on live_session_poll_responses
--    so admins/teachers can see all responses (for results)
-- ============================================================

-- ── 1. FOREIGN KEYS ──────────────────────────────────────────

-- live_session_attendance.session_id → live_sessions(id)
ALTER TABLE "public"."live_session_attendance"
  ADD CONSTRAINT "live_session_attendance_session_id_fkey"
  FOREIGN KEY ("session_id")
  REFERENCES "public"."live_sessions"("id")
  ON DELETE CASCADE;

-- live_session_polls.session_id → live_sessions(id)
ALTER TABLE "public"."live_session_polls"
  ADD CONSTRAINT "live_session_polls_session_id_fkey"
  FOREIGN KEY ("session_id")
  REFERENCES "public"."live_sessions"("id")
  ON DELETE CASCADE;

-- live_session_breakout_rooms.session_id → live_sessions(id)
ALTER TABLE "public"."live_session_breakout_rooms"
  ADD CONSTRAINT "live_session_breakout_rooms_session_id_fkey"
  FOREIGN KEY ("session_id")
  REFERENCES "public"."live_sessions"("id")
  ON DELETE CASCADE;


-- ── 2. RLS POLICIES: live_session_attendance ─────────────────

DROP POLICY IF EXISTS "Staff manage live session attendance" ON "public"."live_session_attendance";
DROP POLICY IF EXISTS "Users insert own attendance"          ON "public"."live_session_attendance";
DROP POLICY IF EXISTS "Users update own attendance"          ON "public"."live_session_attendance";
DROP POLICY IF EXISTS "Users view own attendance"            ON "public"."live_session_attendance";

-- Staff (admin/teacher) can manage attendance for sessions in their school
CREATE POLICY "Staff manage live session attendance"
  ON "public"."live_session_attendance"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."portal_users" pu
      JOIN "public"."live_sessions" ls ON ls.id = live_session_attendance.session_id
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (pu.role = 'admin' OR pu.school_id = ls.school_id)
    )
  );

-- Students can insert/update their own attendance
CREATE POLICY "Users insert own attendance"
  ON "public"."live_session_attendance"
  FOR INSERT
  WITH CHECK ("portal_user_id" = "auth"."uid"());

CREATE POLICY "Users update own attendance"
  ON "public"."live_session_attendance"
  FOR UPDATE
  USING ("portal_user_id" = "auth"."uid"());

CREATE POLICY "Users view own attendance"
  ON "public"."live_session_attendance"
  FOR SELECT
  USING ("portal_user_id" = "auth"."uid"());


-- ── 3. RLS POLICIES: live_session_breakout_participants ───────

DROP POLICY IF EXISTS "Staff manage breakout participants"          ON "public"."live_session_breakout_participants";
DROP POLICY IF EXISTS "Users join breakout room"                    ON "public"."live_session_breakout_participants";
DROP POLICY IF EXISTS "Users update own breakout participation"      ON "public"."live_session_breakout_participants";
DROP POLICY IF EXISTS "Authenticated users view breakout participants" ON "public"."live_session_breakout_participants";

-- Staff can manage breakout participation for their school's sessions
CREATE POLICY "Staff manage breakout participants"
  ON "public"."live_session_breakout_participants"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."portal_users" pu
      JOIN "public"."live_session_breakout_rooms" br ON br.id = live_session_breakout_participants.room_id
      JOIN "public"."live_sessions" ls ON ls.id = br.session_id
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (pu.role = 'admin' OR pu.school_id = ls.school_id)
    )
  );

CREATE POLICY "Users join breakout room"
  ON "public"."live_session_breakout_participants"
  FOR INSERT
  WITH CHECK ("portal_user_id" = "auth"."uid"());

CREATE POLICY "Users update own breakout participation"
  ON "public"."live_session_breakout_participants"
  FOR UPDATE
  USING ("portal_user_id" = "auth"."uid"());

CREATE POLICY "Authenticated users view breakout participants"
  ON "public"."live_session_breakout_participants"
  FOR SELECT
  USING ("auth"."uid"() IS NOT NULL);


-- ── 4. RLS POLICY: poll responses — staff can see all for their school ────────

DROP POLICY IF EXISTS "Staff view poll responses"     ON "public"."live_session_poll_responses";
DROP POLICY IF EXISTS "Users view own poll responses" ON "public"."live_session_poll_responses";

CREATE POLICY "Staff view poll responses"
  ON "public"."live_session_poll_responses"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."portal_users" pu
      JOIN "public"."live_session_polls" lp ON lp.id = live_session_poll_responses.poll_id
      JOIN "public"."live_sessions" ls ON ls.id = lp.session_id
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (pu.role = 'admin' OR pu.school_id = ls.school_id)
    )
  );

-- Users can see their own responses
CREATE POLICY "Users view own poll responses"
  ON "public"."live_session_poll_responses"
  FOR SELECT
  USING ("portal_user_id" = "auth"."uid"());


-- ── 5. INDEXES (if not already present) ──────────────────────

CREATE INDEX IF NOT EXISTS "idx_live_session_attendance_session"
  ON "public"."live_session_attendance" USING btree ("session_id");

CREATE INDEX IF NOT EXISTS "idx_live_session_attendance_user"
  ON "public"."live_session_attendance" USING btree ("portal_user_id");

CREATE INDEX IF NOT EXISTS "idx_live_session_polls_session"
  ON "public"."live_session_polls" USING btree ("session_id");
