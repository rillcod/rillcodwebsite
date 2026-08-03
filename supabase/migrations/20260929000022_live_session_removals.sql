-- Make a host's "Remove" actually stick.
--
-- LiveKit's removeParticipant only closes that person's socket. The meeting client treats
-- the resulting PARTICIPANT_REMOVED disconnect as a network drop, auto-rejoins ~2s later,
-- and the token route happily mints a fresh seat — so the removed student walks straight
-- back into the class. Verified against the live server: remove, then rejoin, and they are
-- in the participant list again.
--
-- Record the removal so the token/join routes can refuse re-entry until the host explicitly
-- re-admits. Deleting the row IS the re-admit.

CREATE TABLE IF NOT EXISTS public.live_session_removals (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "portal_user_id" uuid NOT NULL,
    "removed_by" uuid,
    "removed_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_session_removals_pkey PRIMARY KEY ("id"),
    CONSTRAINT live_session_removals_session_fkey FOREIGN KEY ("session_id")
      REFERENCES public.live_sessions("id") ON DELETE CASCADE,
    CONSTRAINT live_session_removals_user_fkey FOREIGN KEY ("portal_user_id")
      REFERENCES public.portal_users("id") ON DELETE CASCADE,
    CONSTRAINT live_session_removals_by_fkey FOREIGN KEY ("removed_by")
      REFERENCES public.portal_users("id") ON DELETE SET NULL
);

ALTER TABLE "public"."live_session_removals" OWNER TO "postgres";

-- One standing removal per person per session — a second Remove must land on the same row
-- rather than stacking, so that a single "Allow back" fully clears it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_session_removals_session_user
  ON public.live_session_removals USING btree (session_id, portal_user_id);

GRANT ALL ON TABLE "public"."live_session_removals" TO "anon";
GRANT ALL ON TABLE "public"."live_session_removals" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_removals" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_removals" TO "service_role";

ALTER TABLE public.live_session_removals ENABLE ROW LEVEL SECURITY;

-- Every write goes through the moderate route on the service role (which bypasses RLS).
-- These policies exist so a user-scoped client can still read the truth: staff see who they
-- removed, and a removed student can see that they were removed rather than guessing.
DROP POLICY IF EXISTS "Staff manage live session removals" ON public.live_session_removals;
CREATE POLICY "Staff manage live session removals" ON public.live_session_removals
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      JOIN public.live_sessions ls ON ls.id = live_session_removals.session_id
      WHERE pu.id = auth.uid()
        AND pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])
        AND (
          pu.role = 'admin'::text
          OR ls.host_id = pu.id
          OR pu.school_id = ls.school_id
          OR EXISTS (
            SELECT 1 FROM public.teacher_schools ts
            WHERE ts.teacher_id = pu.id AND ts.school_id = ls.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users view own live session removals" ON public.live_session_removals;
CREATE POLICY "Users view own live session removals" ON public.live_session_removals
  FOR SELECT TO PUBLIC
  USING (portal_user_id = auth.uid());
