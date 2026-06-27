-- Connect the term roster to billing/subscription and attendance/session history.
-- Roster lifecycle status remains about membership; money/access state lives in
-- separate fields so a withdrawn student can still have paid history.

ALTER TABLE public.class_term_rosters
  ADD COLUMN IF NOT EXISTS billing_status text DEFAULT 'unknown'
    CHECK (billing_status IN ('unknown', 'not_required', 'pending', 'sent', 'paid', 'overdue', 'cancelled', 'void', 'rolled_over')),
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'unknown'
    CHECK (subscription_status IN ('unknown', 'active', 'trialing', 'past_due', 'suspended', 'cancelled', 'expired')),
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_cycle_id uuid REFERENCES public.billing_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_suspension_reason text;

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_billing_status
  ON public.class_term_rosters(billing_status);

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_subscription_status
  ON public.class_term_rosters(subscription_status);

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_invoice
  ON public.class_term_rosters(invoice_id);

CREATE INDEX IF NOT EXISTS idx_class_term_rosters_billing_cycle
  ON public.class_term_rosters(billing_cycle_id);

ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_term
  ON public.class_sessions(term_id);

UPDATE public.class_sessions cs
SET term_id = COALESCE(c.term_id, public.term_id_for_date(cs.session_date::date))
FROM public.classes c
WHERE cs.class_id = c.id
  AND cs.term_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_class_session_term_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_term_id uuid;
BEGIN
  SELECT c.term_id INTO v_term_id
  FROM public.classes c
  WHERE c.id = NEW.class_id;

  NEW.term_id := COALESCE(NEW.term_id, v_term_id, public.term_id_for_date(NEW.session_date::date));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_class_session_term_id ON public.class_sessions;
CREATE TRIGGER set_class_session_term_id
BEFORE INSERT OR UPDATE OF class_id, session_date, term_id ON public.class_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_class_session_term_id();

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_term_roster_id uuid REFERENCES public.class_term_rosters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_term
  ON public.attendance(term_id);

CREATE INDEX IF NOT EXISTS idx_attendance_class_term_roster
  ON public.attendance(class_term_roster_id);

UPDATE public.attendance a
SET
  term_id = cs.term_id,
  class_term_roster_id = (
    SELECT ctr.id
    FROM public.class_term_rosters ctr
    WHERE ctr.class_id = cs.class_id
      AND ctr.student_id = COALESCE(a.user_id, a.student_id)
      AND (
        (cs.term_id IS NOT NULL AND ctr.term_id = cs.term_id)
        OR (cs.term_id IS NULL AND ctr.term_id IS NULL)
      )
    ORDER BY
      CASE ctr.status WHEN 'active' THEN 0 ELSE 1 END,
      ctr.reinstated_at DESC NULLS LAST,
      ctr.started_at DESC
    LIMIT 1
  )
FROM public.class_sessions cs
WHERE a.session_id = cs.id
  AND (a.term_id IS NULL OR a.class_term_roster_id IS NULL);

CREATE OR REPLACE FUNCTION public.set_attendance_roster_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id uuid;
  v_term_id uuid;
  v_student_id uuid;
  v_roster_id uuid;
BEGIN
  SELECT cs.class_id, cs.term_id INTO v_class_id, v_term_id
  FROM public.class_sessions cs
  WHERE cs.id = NEW.session_id;

  v_student_id := COALESCE(NEW.user_id, NEW.student_id);

  IF v_term_id IS NULL AND NEW.session_id IS NOT NULL THEN
    SELECT public.term_id_for_date(cs.session_date::date) INTO v_term_id
    FROM public.class_sessions cs
    WHERE cs.id = NEW.session_id;
  END IF;

  IF v_class_id IS NOT NULL AND v_student_id IS NOT NULL THEN
    SELECT ctr.id INTO v_roster_id
    FROM public.class_term_rosters ctr
    WHERE ctr.class_id = v_class_id
      AND ctr.student_id = v_student_id
      AND (
        (v_term_id IS NOT NULL AND ctr.term_id = v_term_id)
        OR (v_term_id IS NULL AND ctr.term_id IS NULL)
      )
    ORDER BY
      CASE ctr.status WHEN 'active' THEN 0 ELSE 1 END,
      ctr.reinstated_at DESC NULLS LAST,
      ctr.started_at DESC
    LIMIT 1;
  END IF;

  NEW.term_id := COALESCE(NEW.term_id, v_term_id);
  NEW.class_term_roster_id := COALESCE(NEW.class_term_roster_id, v_roster_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_attendance_roster_context ON public.attendance;
CREATE TRIGGER set_attendance_roster_context
BEFORE INSERT OR UPDATE OF session_id, user_id, student_id, term_id, class_term_roster_id ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_roster_context();

