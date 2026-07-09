-- Class recordings: a LiveKit Egress recording of a live session, stored in Cloudflare R2,
-- surfaced back to the class so students can rewatch. One row per recording take.
CREATE TABLE IF NOT EXISTS public.session_recordings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  -- Denormalised scope so recordings can be listed/authorised without re-joining live_sessions.
  school_id     uuid,
  program_id    uuid,
  class_id      uuid,
  title         text,
  egress_id     text,                          -- LiveKit egress id (for stop + webhook correlation)
  r2_key        text,                          -- object key in the R2 bucket (filepath we set on egress)
  status        text NOT NULL DEFAULT 'recording'
                CHECK (status IN ('recording','processing','ready','failed')),
  duration_seconds integer,
  size_bytes    bigint,
  error         text,
  started_by    uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_recordings_session ON public.session_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_school  ON public.session_recordings(school_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_program ON public.session_recordings(program_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_recordings_egress
  ON public.session_recordings(egress_id) WHERE egress_id IS NOT NULL;

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_session_recordings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_session_recordings ON public.session_recordings;
CREATE TRIGGER trg_touch_session_recordings
  BEFORE UPDATE ON public.session_recordings
  FOR EACH ROW EXECUTE FUNCTION public.touch_session_recordings_updated_at();

-- RLS: all reads/writes flow through service-role API routes (which enforce scope), so keep
-- RLS on with no permissive policy for anon/auth — the service role bypasses it.
ALTER TABLE public.session_recordings ENABLE ROW LEVEL SECURITY;
