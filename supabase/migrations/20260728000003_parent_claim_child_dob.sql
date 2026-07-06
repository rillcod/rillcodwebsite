-- Date of birth captured on the OTP claim step (preferred over age alone).
ALTER TABLE public.parent_claim_otps
  ADD COLUMN IF NOT EXISTS child_dob date;
