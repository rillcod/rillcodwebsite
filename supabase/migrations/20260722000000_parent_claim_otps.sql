-- ─────────────────────────────────────────────────────────────────────────────
-- parent_claim_otps
-- Backs the "Parent Claim & Verify" flow: a parent scanning a child's result/ID card
-- proves ownership of a real email + phone via a one-time code, which then creates /
-- links a verified parent account and links the child (and siblings).
-- Accessed only via service-role API routes, so RLS denies all direct access.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_claim_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  full_name   text        NOT NULL,
  email       text        NOT NULL,
  phone       text,
  code_hash   text        NOT NULL,
  attempts    integer     NOT NULL DEFAULT 0,
  verified    boolean     NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_claim_otps_student ON public.parent_claim_otps (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_claim_otps_expires ON public.parent_claim_otps (expires_at);

ALTER TABLE public.parent_claim_otps ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (API routes) may read/write.
