-- HARD GUARD for the summer onboarding invariant:
--   prospective_students.is_active = true  ⇒  a real student account exists.
--
-- A swallowed onboarding error in the payment webhook used to set is_active=true
-- with NO student account ("paid + active but no login" ghosts, e.g. David Ogunleye),
-- which the onboarding-sweep cron then skipped (it only retries is_active=false).
--
-- This trigger COERCES (does not raise): if a summer prospect is being marked active
-- but no matching student account exists yet, it silently keeps is_active=false. That
-- makes the ghost state impossible to persist, while never breaking a payment webhook
-- — the cron's Pass 1 (paid/partially_paid + is_active=false) then heals it. We learned
-- a hard REJECT gate is too aggressive (it broke all account creation); coercion is the
-- safe equivalent here.
--
-- Legit flows are unaffected: approvals / ensure-onboarded / manual-payment / webhook
-- all create the student row (with the prospect's parent_email + full_name) BEFORE
-- flipping is_active, so the EXISTS check passes. Balance-payment re-activations also
-- pass because the account already exists.

CREATE OR REPLACE FUNCTION public.guard_summer_prospect_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true
     AND COALESCE(NEW.is_deleted, false) = false
     AND COALESCE(NEW.course_interest, '') ILIKE '%summer%'
     AND NEW.status IN ('paid', 'partially_paid', 'active')
     AND NOT EXISTS (
       SELECT 1
       FROM public.students s
       WHERE s.user_id IS NOT NULL
         -- normalize like the app: trim + collapse internal whitespace, case-insensitive
         AND btrim(regexp_replace(lower(s.full_name), '\s+', ' ', 'g')) = btrim(regexp_replace(lower(NEW.full_name), '\s+', ' ', 'g'))
         AND lower(btrim(COALESCE(s.parent_email, ''))) = lower(btrim(COALESCE(NEW.parent_email, NEW.email, '')))
     )
  THEN
    -- No student account yet — refuse to mark active; the sweep cron will onboard + heal.
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_summer_prospect_active ON public.prospective_students;
CREATE TRIGGER trg_guard_summer_prospect_active
  BEFORE INSERT OR UPDATE ON public.prospective_students
  FOR EACH ROW EXECUTE FUNCTION public.guard_summer_prospect_active();
