-- Show Rillcod's own bank details to people who are registering.
--
-- StudentRegistration.tsx:560 reads payment_accounts from the browser on the
-- public /student-registration page, so that read runs as anon. Every policy on
-- the table was TO authenticated, so a logged-out visitor got zero rows —
-- silently, because RLS returns an empty set rather than an error.
--
-- The visible effect: a parent picks "Bank transfer", is shown the amount field
-- and asked for a payment reference, and is given no account number to pay
-- into. bankTransferReady does not depend on bankAccounts, so the form let them
-- carry on regardless. People were being asked to transfer money to nowhere.
--
-- This is the payment_accounts twin of schools_public_read_approved in
-- 20260929000115: the narrowest possible anon read, on exactly the rows the
-- public page needs, and nothing else.
--
-- Scope is deliberately tight:
--   * is_active = true             — retired accounts stay hidden
--   * owner_type in rillcod/global — Rillcod's own receiving accounts, the ones
--                                    already printed on invoices and meant to be
--                                    handed to anyone paying
--   * school_id IS NULL            — belt and braces. A partner school's own
--                                    account must never be public, so even a row
--                                    mislabelled 'rillcod' stays private while it
--                                    carries a school_id. If a legitimate Rillcod
--                                    account ever fails to appear on the public
--                                    form, this clause is the first thing to check.

BEGIN;

DROP POLICY IF EXISTS payment_accounts_public_read_rillcod ON public.payment_accounts;
CREATE POLICY payment_accounts_public_read_rillcod
  ON public.payment_accounts
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND owner_type IN ('rillcod', 'global')
    AND school_id IS NULL
  );

-- Read-only, and only that. The baseline handed anon GRANT ALL here.
REVOKE ALL ON TABLE public.payment_accounts FROM anon;
GRANT SELECT ON TABLE public.payment_accounts TO anon;

COMMIT;
