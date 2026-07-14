-- QA fix: drop legacy get_at_risk_students(uuid, integer) so PostgREST/SQL
-- can uniquely resolve the session-scoped (uuid, uuid) signature.

DROP FUNCTION IF EXISTS public.get_at_risk_students(uuid, integer);

-- Ensure the session-scoped signature stays granted.
GRANT EXECUTE ON FUNCTION public.get_at_risk_students(uuid, uuid)
  TO authenticated, service_role;
