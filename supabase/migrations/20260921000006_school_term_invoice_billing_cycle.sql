-- Canonical school term billing: one school + one academic term = one billing cycle.
ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS academic_term_id uuid NULL
  REFERENCES public.academic_terms(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.billing_cycles.academic_term_id IS
  'Authoritative academic term; runtime code must not infer this relationship from labels.';

UPDATE public.billing_cycles bc
SET academic_term_id = (i.metadata->>'academic_term_id')::uuid
FROM public.invoices i
WHERE bc.invoice_id = i.id
  AND bc.academic_term_id IS NULL
  AND i.metadata->>'academic_term_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.academic_terms at WHERE at.id = (i.metadata->>'academic_term_id')::uuid);

CREATE UNIQUE INDEX IF NOT EXISTS billing_cycles_active_school_term_unique
  ON public.billing_cycles (owner_school_id, academic_term_id)
  WHERE owner_type = 'school' AND owner_school_id IS NOT NULL
    AND academic_term_id IS NOT NULL AND archived_at IS NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_billing_cycles_academic_term_id
  ON public.billing_cycles (academic_term_id) WHERE academic_term_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_school_term_invoice_atomic(
  p_invoice_number text, p_school_id uuid, p_academic_term_id uuid,
  p_amount numeric, p_currency text, p_status text, p_due_date timestamptz,
  p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_term public.academic_terms%ROWTYPE;
  v_cycle public.billing_cycles%ROWTYPE;
  v_existing public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_cycle_id uuid;
  v_cycle_status text;
BEGIN
  IF p_school_id IS NULL OR p_academic_term_id IS NULL THEN
    RAISE EXCEPTION 'school_id and academic_term_id are required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;
  IF p_due_date IS NULL THEN RAISE EXCEPTION 'A due date is required for automated school billing'; END IF;

  SELECT * INTO v_term FROM public.academic_terms WHERE id = p_academic_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic term not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':' || p_academic_term_id::text, 0));

  SELECT * INTO v_existing FROM public.invoices
  WHERE school_id = p_school_id AND stream = 'school'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'void')
    AND metadata->>'academic_term_id' = p_academic_term_id::text
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'An active school invoice already exists for this academic term (%)', v_existing.invoice_number
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_cycle FROM public.billing_cycles
  WHERE owner_type = 'school' AND owner_school_id = p_school_id
    AND academic_term_id = p_academic_term_id AND archived_at IS NULL AND status <> 'cancelled'
  LIMIT 1 FOR UPDATE;

  v_cycle_status := CASE WHEN p_due_date::date < current_date THEN 'past_due' ELSE 'due' END;
  IF FOUND THEN
    IF v_cycle.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Billing cycle already has an invoice' USING ERRCODE = '23505';
    END IF;
    v_cycle_id := v_cycle.id;
    UPDATE public.billing_cycles SET due_date=p_due_date::date, amount_due=p_amount,
      currency=upper(COALESCE(p_currency,'NGN')), status=v_cycle_status,
      items=COALESCE(p_items,'[]'::jsonb), updated_at=now() WHERE id=v_cycle_id;
  ELSE
    INSERT INTO public.billing_cycles (
      owner_type,owner_school_id,school_id,academic_term_id,term_label,
      term_start_date,due_date,amount_due,currency,status,items,created_at,updated_at
    ) VALUES (
      'school',p_school_id,p_school_id,p_academic_term_id,
      v_term.term_label || ' ' || v_term.academic_year,v_term.start_date,p_due_date::date,
      p_amount,upper(COALESCE(p_currency,'NGN')),v_cycle_status,
      COALESCE(p_items,'[]'::jsonb),now(),now()
    ) RETURNING id INTO v_cycle_id;
  END IF;

  INSERT INTO public.invoices (
    invoice_number,school_id,amount,original_amount,amount_paid,amount_remaining,
    currency,status,due_date,items,notes,stream,billing_cycle_id,metadata,created_at,updated_at
  ) VALUES (
    p_invoice_number,p_school_id,p_amount,p_amount,0,p_amount,
    upper(COALESCE(p_currency,'NGN')),p_status,p_due_date,COALESCE(p_items,'[]'::jsonb),
    p_notes,'school',v_cycle_id,COALESCE(p_metadata,'{}'::jsonb) ||
    jsonb_build_object('academic_term_id',p_academic_term_id,'billing_cycle_id',v_cycle_id,'billing_automation',true),
    now(),now()
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.billing_cycles SET invoice_id=v_invoice_id,updated_at=now() WHERE id=v_cycle_id;
  RETURN jsonb_build_object('invoice_id',v_invoice_id,'cycle_id',v_cycle_id,
    'academic_term_id',p_academic_term_id,'automation_started',true,'actor_id',p_actor_id);
END $$;

REVOKE ALL ON FUNCTION public.create_school_term_invoice_atomic(
  text,uuid,uuid,numeric,text,text,timestamptz,jsonb,text,jsonb,uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_school_term_invoice_atomic(
  text,uuid,uuid,numeric,text,text,timestamptz,jsonb,text,jsonb,uuid
) TO service_role;

-- Adopt only unambiguous legacy invoices: exactly one active invoice per school/term.
DO $$
DECLARE r record; v_cycle_id uuid; v_term public.academic_terms%ROWTYPE;
BEGIN
  FOR r IN
    SELECT min(i.id::text)::uuid invoice_id,i.school_id,
      (i.metadata->>'academic_term_id')::uuid academic_term_id
    FROM public.invoices i
    WHERE i.stream='school' AND i.school_id IS NOT NULL AND i.billing_cycle_id IS NULL
      AND lower(COALESCE(i.status,'')) NOT IN ('cancelled','void')
      AND i.metadata->>'academic_term_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY i.school_id,(i.metadata->>'academic_term_id')::uuid HAVING count(*)=1
  LOOP
    SELECT * INTO v_term FROM public.academic_terms WHERE id=r.academic_term_id;
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.billing_cycles bc WHERE bc.owner_school_id=r.school_id
        AND bc.academic_term_id=r.academic_term_id AND bc.archived_at IS NULL AND bc.status<>'cancelled'
    ) THEN
      INSERT INTO public.billing_cycles (
        owner_type,owner_school_id,school_id,academic_term_id,invoice_id,term_label,
        term_start_date,due_date,amount_due,currency,status,items
      ) SELECT 'school',i.school_id,i.school_id,r.academic_term_id,i.id,
        v_term.term_label || ' ' || v_term.academic_year,v_term.start_date,
        COALESCE(i.due_date::date,v_term.end_date),i.amount_remaining,i.currency,
        CASE WHEN lower(i.status)='paid' THEN 'paid'
             WHEN COALESCE(i.due_date::date,v_term.end_date)<current_date THEN 'past_due' ELSE 'due' END,
        COALESCE(i.items,'[]'::jsonb)
      FROM public.invoices i WHERE i.id=r.invoice_id RETURNING id INTO v_cycle_id;
      UPDATE public.invoices SET billing_cycle_id=v_cycle_id,
        metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
          'billing_cycle_id',v_cycle_id,'billing_automation',true),updated_at=now()
      WHERE id=r.invoice_id;
    END IF;
  END LOOP;
END $$;