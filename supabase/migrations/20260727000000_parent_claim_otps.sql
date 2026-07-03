-- ─────────────────────────────────────────────────────────────────────────────
-- parent_claim_otps
-- Backs the OTP verification gate on the self-service parent claim: a parent scanning
-- a child's result/ID card proves ownership of a real email + phone via a one-time
-- code before their account is created & linked. Stores the claim context so verify
-- can complete without re-collecting. Accessed only via service-role API routes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_claim_otps (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  full_name     text        NOT NULL,
  email         text        NOT NULL,
  phone         text,
  relationship  text,
  child_name    text,
  code_hash     text        NOT NULL,
  attempts      integer     NOT NULL DEFAULT 0,
  verified      boolean     NOT NULL DEFAULT false,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_claim_otps_student ON public.parent_claim_otps (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_claim_otps_expires ON public.parent_claim_otps (expires_at);

ALTER TABLE public.parent_claim_otps ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (API routes) may read/write.
