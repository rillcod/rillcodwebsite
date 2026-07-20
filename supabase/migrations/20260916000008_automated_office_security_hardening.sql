-- Close direct-access gaps found during the automated-office end-to-end audit.

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
      AND COALESCE(is_deleted, false) = false
  )
$$;

DROP POLICY IF EXISTS "case participants can view cases" ON public.communication_cases;
DROP POLICY IF EXISTS "staff can update assigned cases" ON public.communication_cases;
DROP POLICY IF EXISTS "case participants can view events" ON public.communication_case_events;

CREATE POLICY "active participants can view cases"
ON public.communication_cases
FOR SELECT TO authenticated
USING (
  requester_id = auth.uid()
  OR public.is_active_admin()
  OR (
    assigned_to = auth.uid()
    AND restricted = false
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'teacher'
        AND pu.is_active = true
        AND COALESCE(pu.is_deleted, false) = false
    )
  )
);

CREATE POLICY "active participants can view case events"
ON public.communication_case_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.communication_cases communication_case
    WHERE communication_case.id = case_id
      AND (
        communication_case.requester_id = auth.uid()
        OR public.is_active_admin()
        OR (
          communication_case.assigned_to = auth.uid()
          AND communication_case.restricted = false
          AND EXISTS (
            SELECT 1 FROM public.portal_users pu
            WHERE pu.id = auth.uid()
              AND pu.role = 'teacher'
              AND pu.is_active = true
              AND COALESCE(pu.is_deleted, false) = false
          )
        )
      )
  )
);

-- All case mutations pass through authenticated server routes that validate role,
-- ownership, sensitivity and allowed staff assignments.
REVOKE INSERT, UPDATE, DELETE ON public.communication_cases FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.communication_case_events FROM anon, authenticated;
GRANT SELECT ON public.communication_cases, public.communication_case_events TO authenticated;

DROP POLICY IF EXISTS customer_own_outcomes ON public.customer_value_outcomes;
CREATE POLICY customer_owned_outcomes
ON public.customer_value_outcomes
FOR INSERT TO authenticated
WITH CHECK (
  portal_user_id = auth.uid()
  AND (
    case_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.communication_cases communication_case
      WHERE communication_case.id = case_id
        AND communication_case.requester_id = auth.uid()
    )
  )
  AND (
    feedback_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.feedback feedback_row
      WHERE feedback_row.id = feedback_id
        AND feedback_row.user_id = auth.uid()
    )
  )
);

COMMENT ON POLICY "active participants can view cases" ON public.communication_cases
IS 'Customers see their own cases; active administrators see the office queue; active teachers see only assigned non-restricted work.';
