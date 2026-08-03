-- Recurring live sessions ("every Mon/Tue/Thu at 8pm") + reminders that can reach parents.
--
-- Until now every class was a standalone live_sessions row typed in by hand, and the
-- reminders cron only ever notified students. A programme's timetable had to be re-entered
-- week after week.
--
-- Occurrences are MATERIALISED as real live_sessions rows rather than computed on the fly:
-- attendance, recordings, polls, Q&A, breakout rooms and live_session_removals all key off a
-- concrete session_id, and a virtual occurrence has nothing for them to point at.

CREATE TABLE IF NOT EXISTS public.live_session_series (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "host_id" uuid NOT NULL,
    "school_id" uuid,
    "program_id" uuid,
    "platform" text DEFAULT 'other'::text NOT NULL,

    -- ── Pattern ──────────────────────────────────────────────────────────────
    -- 0 = Sunday … 6 = Saturday, matching JS getDay(). "Every day at 8pm" is all seven.
    "weekdays" smallint[] NOT NULL,
    -- Wall-clock time in `timezone`, NOT an instant: 20:00 must stay 20:00 for the school
    -- whatever the server is doing. Nigeria has no DST, but storing the zone keeps this
    -- honest if the app is ever used elsewhere.
    "start_time" text NOT NULL,
    "timezone" text DEFAULT 'Africa/Lagos'::text NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,

    -- ── Window ───────────────────────────────────────────────────────────────
    -- Regular school programmes bound to an academic term. Special programmes (summer
    -- school, holiday intensives) run to their own calendar and set the dates directly.
    -- Both may be present, in which case the window is their intersection.
    "term_id" uuid,
    "starts_on" date,
    "ends_on" date,

    -- ── Controls ─────────────────────────────────────────────────────────────
    -- Staff decide whether a series reaches parents at all; an individual parent can still
    -- mute it via notification_preferences.live_session_reminders.
    "notify_parents" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT live_session_series_pkey PRIMARY KEY ("id"),
    CONSTRAINT live_session_series_host_fkey FOREIGN KEY ("host_id")
      REFERENCES public.portal_users("id") ON DELETE CASCADE,
    CONSTRAINT live_session_series_school_fkey FOREIGN KEY ("school_id")
      REFERENCES public.schools("id") ON DELETE CASCADE,
    CONSTRAINT live_session_series_program_fkey FOREIGN KEY ("program_id")
      REFERENCES public.programs("id") ON DELETE CASCADE,
    CONSTRAINT live_session_series_term_fkey FOREIGN KEY ("term_id")
      REFERENCES public.academic_terms("id") ON DELETE SET NULL,
    CONSTRAINT live_session_series_created_by_fkey FOREIGN KEY ("created_by")
      REFERENCES public.portal_users("id") ON DELETE SET NULL,

    -- A pattern with no days would generate nothing forever.
    CONSTRAINT live_session_series_weekdays_present CHECK (array_length("weekdays", 1) >= 1),
    CONSTRAINT live_session_series_time_format CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT live_session_series_duration CHECK ("duration_minutes" > 0 AND "duration_minutes" <= 600),
    -- Every series must terminate: either a term bounds it, or an explicit end date does.
    -- Without this an abandoned series would fill the calendar forever.
    CONSTRAINT live_session_series_bounded CHECK ("term_id" IS NOT NULL OR "ends_on" IS NOT NULL),
    CONSTRAINT live_session_series_window_ordered CHECK (
      "starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on"
    )
);

ALTER TABLE "public"."live_session_series" OWNER TO "postgres";

-- weekday values must be real weekdays; a stray 9 would silently never fire.
CREATE OR REPLACE FUNCTION public.live_session_series_weekdays_valid(days smallint[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT bool_and(d BETWEEN 0 AND 6) FROM unnest(days) AS d;
$$;

ALTER TABLE public.live_session_series
  DROP CONSTRAINT IF EXISTS live_session_series_weekdays_range;
ALTER TABLE public.live_session_series
  ADD CONSTRAINT live_session_series_weekdays_range
  CHECK (public.live_session_series_weekdays_valid("weekdays"));

CREATE INDEX IF NOT EXISTS idx_live_session_series_active
  ON public.live_session_series USING btree (is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_live_session_series_school ON public.live_session_series USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_live_session_series_program ON public.live_session_series USING btree (program_id);

-- ── Link occurrences back to their series ───────────────────────────────────
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS "series_id" uuid;
DO $$ BEGIN
  ALTER TABLE public.live_sessions
    ADD CONSTRAINT live_sessions_series_fkey FOREIGN KEY ("series_id")
    REFERENCES public.live_session_series("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- THE idempotency guarantee for the materialiser: it runs every 15 minutes and must never
-- create a second copy of an occurrence it already made.
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_sessions_series_slot
  ON public.live_sessions USING btree (series_id, scheduled_at) WHERE (series_id IS NOT NULL);

-- ── Parent opt-out ──────────────────────────────────────────────────────────
-- Defaults true: staff still have to switch a series on before anything is sent, so this
-- only decides whether a parent who IS in scope may mute it.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS "live_session_reminders" boolean DEFAULT true NOT NULL;

GRANT ALL ON TABLE "public"."live_session_series" TO "anon";
GRANT ALL ON TABLE "public"."live_session_series" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_series" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_series" TO "service_role";
GRANT EXECUTE ON FUNCTION public.live_session_series_weekdays_valid(smallint[]) TO authenticated, service_role;

ALTER TABLE public.live_session_series ENABLE ROW LEVEL SECURITY;

-- Writes go through the API on the service role. These policies let a user-scoped client
-- read/manage its own series without a round trip.
DROP POLICY IF EXISTS "Staff manage live session series" ON public.live_session_series;
CREATE POLICY "Staff manage live session series" ON public.live_session_series
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])
        AND (
          pu.role = 'admin'::text
          OR live_session_series.host_id = pu.id
          OR pu.school_id = live_session_series.school_id
          OR EXISTS (
            SELECT 1 FROM public.teacher_schools ts
            WHERE ts.teacher_id = pu.id AND ts.school_id = live_session_series.school_id
          )
        )
    )
  );
