-- Store child gender collected during the QR parent-claim OTP step so verify can
-- persist it without re-posting from the client.
ALTER TABLE public.parent_claim_otps
  ADD COLUMN IF NOT EXISTS child_gender text
  CHECK (child_gender IS NULL OR child_gender IN ('male', 'female'));
