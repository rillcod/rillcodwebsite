-- Phase 1 audit: atomic duty handover + hardened operations staff policies.

-- ── Duty handover (transactional) ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handover_primary_duty(
  p_staff_id uuid,
  p_duty_kind text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_created_by uuid,
  p_is_primary boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.operations_duty_rota%ROWTYPE;
BEGIN
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Duty end must be after start.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('duty:' || p_duty_kind, 0));

  IF p_is_primary THEN
    UPDATE public.operations_duty_rota
    SET status = 'completed',
        updated_at = p_starts_at
    WHERE duty_kind = p_duty_kind
      AND is_primary = true
      AND status IN ('scheduled', 'active')
      AND starts_at <= p_starts_at
      AND ends_at > p_starts_at;
  END IF;

  INSERT INTO public.operations_duty_rota (
    staff_id,
    duty_kind,
    starts_at,
    ends_at,
    is_primary,
    status,
    created_by
  ) VALUES (
    p_staff_id,
    p_duty_kind,
    p_starts_at,
    p_ends_at,
    p_is_primary,
    'active',
    p_created_by
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.handover_primary_duty(uuid, text, timestamptz, timestamptz, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handover_primary_duty(uuid, text, timestamptz, timestamptz, uuid, boolean) TO service_role;

-- ── Operations staff settings — remove unsafe teacher self-writes ────────────

DROP POLICY IF EXISTS "staff can create own operations settings" ON public.operations_staff_settings;
DROP POLICY IF EXISTS "staff can update own operations settings" ON public.operations_staff_settings;

DROP POLICY IF EXISTS "operations staff can view staff settings" ON public.operations_staff_settings;
CREATE POLICY "operations staff can view staff settings"
  ON public.operations_staff_settings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher')
        AND COALESCE(pu.is_active, true)
        AND NOT COALESCE(pu.is_deleted, false)
    )
  );

-- Admins retain full management via existing policy; teachers may only read.

COMMENT ON TABLE public.operations_staff_settings IS
  'Availability and capacity for operators. Protected fields (is_primary_admin, notes) are server-managed only.';
