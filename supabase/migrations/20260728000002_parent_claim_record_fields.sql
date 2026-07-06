-- Extra fields captured during QR parent-claim (OTP step carries them through to verify).
ALTER TABLE public.parent_claim_otps
  ADD COLUMN IF NOT EXISTS child_age integer
    CHECK (child_age IS NULL OR (child_age >= 3 AND child_age <= 25)),
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_email ON public.parent_claim_audit (email);
CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_action ON public.parent_claim_audit (action);
