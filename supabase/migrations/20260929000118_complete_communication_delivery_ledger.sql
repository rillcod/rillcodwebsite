-- One provider-neutral lifecycle per outbound message, with append-only receipt
-- history. Queued WhatsApp work and provider callbacks can now be reconciled
-- without duplicating deliveries or regressing delivered/read states.

ALTER TABLE public.communication_delivery_log
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS school_id uuid,
  ADD COLUMN IF NOT EXISTS outbox_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

ALTER TABLE public.whatsapp_outbox
  ADD COLUMN IF NOT EXISTS delivery_log_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_delivery_log_recipient_user_id_fkey') THEN
    ALTER TABLE public.communication_delivery_log
      ADD CONSTRAINT communication_delivery_log_recipient_user_id_fkey
      FOREIGN KEY (recipient_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_delivery_log_school_id_fkey') THEN
    ALTER TABLE public.communication_delivery_log
      ADD CONSTRAINT communication_delivery_log_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_delivery_log_outbox_id_fkey') THEN
    ALTER TABLE public.communication_delivery_log
      ADD CONSTRAINT communication_delivery_log_outbox_id_fkey
      FOREIGN KEY (outbox_id) REFERENCES public.whatsapp_outbox(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_outbox_delivery_log_id_fkey') THEN
    ALTER TABLE public.whatsapp_outbox
      ADD CONSTRAINT whatsapp_outbox_delivery_log_id_fkey
      FOREIGN KEY (delivery_log_id) REFERENCES public.communication_delivery_log(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_delivery_log_attempt_count_check') THEN
    ALTER TABLE public.communication_delivery_log
      ADD CONSTRAINT communication_delivery_log_attempt_count_check CHECK (attempt_count >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS communication_delivery_channel_idempotency_unique
  ON public.communication_delivery_log(channel, idempotency_key);
CREATE INDEX IF NOT EXISTS communication_delivery_source_idx
  ON public.communication_delivery_log(source_type, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_delivery_recipient_user_idx
  ON public.communication_delivery_log(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_delivery_outbox_idx
  ON public.communication_delivery_log(outbox_id) WHERE outbox_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.communication_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid REFERENCES public.communication_delivery_log(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'in_app', 'sms', 'push')),
  provider text,
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'suppressed')),
  provider_status text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS communication_delivery_events_delivery_idx
  ON public.communication_delivery_events(delivery_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS communication_delivery_events_unmatched_idx
  ON public.communication_delivery_events(provider, provider_message_id, received_at DESC)
  WHERE delivery_id IS NULL AND provider_message_id IS NOT NULL;

ALTER TABLE public.communication_delivery_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_delivery_events_admin_read ON public.communication_delivery_events;
CREATE POLICY communication_delivery_events_admin_read
ON public.communication_delivery_events FOR SELECT TO authenticated
USING (public.is_active_admin());
REVOKE ALL ON TABLE public.communication_delivery_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.communication_delivery_events TO authenticated;
GRANT ALL ON TABLE public.communication_delivery_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_communication_delivery_event(
  p_delivery_id uuid,
  p_event_key text,
  p_status text,
  p_channel text,
  p_provider text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_provider_status text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now(),
  p_error text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(delivery_id uuid, current_status text, event_inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_inserted uuid;
  v_advance boolean := false;
  v_attempt integer;
BEGIN
  IF p_status NOT IN ('queued', 'sent', 'delivered', 'read', 'failed', 'suppressed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported delivery status';
  END IF;
  IF nullif(trim(p_event_key), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Delivery event key is required';
  END IF;

  SELECT status INTO v_current
  FROM public.communication_delivery_log
  WHERE id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Delivery record not found';
  END IF;

  INSERT INTO public.communication_delivery_events(
    delivery_id, event_key, channel, provider, provider_message_id,
    status, provider_status, occurred_at, error, metadata
  ) VALUES (
    p_delivery_id, p_event_key, p_channel, p_provider, p_provider_message_id,
    p_status, p_provider_status, COALESCE(p_occurred_at, now()),
    left(p_error, 4000), COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN QUERY SELECT p_delivery_id, v_current, false;
    RETURN;
  END IF;

  v_advance := CASE
    WHEN v_current = 'read' THEN false
    WHEN v_current = 'delivered' AND p_status NOT IN ('read') THEN false
    WHEN v_current = 'sent' AND p_status = 'queued' THEN false
    ELSE true
  END;
  v_attempt := CASE
    WHEN COALESCE(p_metadata->>'attempt_number', '') ~ '^[0-9]+$'
      THEN (p_metadata->>'attempt_number')::integer
    ELSE NULL
  END;

  UPDATE public.communication_delivery_log
  SET
    status = CASE WHEN v_advance THEN p_status ELSE status END,
    provider = COALESCE(p_provider, provider),
    provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
    attempt_count = GREATEST(attempt_count, COALESCE(v_attempt, attempt_count)),
    queued_at = CASE WHEN p_status = 'queued' THEN COALESCE(queued_at, p_occurred_at, now()) ELSE queued_at END,
    provider_accepted_at = CASE WHEN p_status IN ('sent', 'delivered', 'read') THEN COALESCE(provider_accepted_at, p_occurred_at, now()) ELSE provider_accepted_at END,
    sent_at = CASE WHEN p_status IN ('sent', 'delivered', 'read') THEN COALESCE(sent_at, p_occurred_at, now()) ELSE sent_at END,
    delivered_at = CASE WHEN p_status IN ('delivered', 'read') THEN COALESCE(delivered_at, p_occurred_at, now()) ELSE delivered_at END,
    read_at = CASE WHEN p_status = 'read' THEN COALESCE(read_at, p_occurred_at, now()) ELSE read_at END,
    failed_at = CASE WHEN p_status = 'failed' AND status NOT IN ('delivered', 'read') THEN COALESCE(failed_at, p_occurred_at, now()) ELSE failed_at END,
    error = CASE
      WHEN v_advance AND p_status IN ('sent', 'delivered', 'read') THEN NULL
      WHEN v_advance AND p_status IN ('failed', 'suppressed') THEN left(p_error, 4000)
      ELSE error
    END,
    metadata = metadata || COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider_event', COALESCE(p_provider_status, p_status),
      'provider_event_at', COALESCE(p_occurred_at, now())
    ),
    last_event_at = GREATEST(COALESCE(last_event_at, '-infinity'::timestamptz), COALESCE(p_occurred_at, now())),
    updated_at = now()
  WHERE id = p_delivery_id;

  SELECT status INTO v_current FROM public.communication_delivery_log WHERE id = p_delivery_id;
  RETURN QUERY SELECT p_delivery_id, v_current, true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_communication_delivery_event(uuid, text, text, text, text, text, text, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_communication_delivery_event(uuid, text, text, text, text, text, text, timestamptz, text, jsonb) TO service_role;

-- Provider receipts may arrive before the outbound insert completes. Attach
-- those early receipts automatically when the canonical delivery appears.
CREATE OR REPLACE FUNCTION public.reconcile_communication_delivery_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt record;
BEGIN
  IF NEW.provider_message_id IS NULL THEN RETURN NEW; END IF;
  FOR receipt IN
    UPDATE public.communication_delivery_events
    SET delivery_id = NEW.id
    WHERE delivery_id IS NULL
      AND provider_message_id = NEW.provider_message_id
      AND (provider IS NULL OR NEW.provider IS NULL OR provider = NEW.provider)
    RETURNING *
  LOOP
    PERFORM public.record_communication_delivery_event(
      NEW.id, receipt.event_key || ':reconciled', receipt.status, receipt.channel,
      receipt.provider, receipt.provider_message_id, receipt.provider_status,
      receipt.occurred_at, receipt.error, receipt.metadata || '{"reconciled":true}'::jsonb
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_communication_delivery_events_trigger ON public.communication_delivery_log;
CREATE TRIGGER reconcile_communication_delivery_events_trigger
AFTER INSERT OR UPDATE OF provider, provider_message_id ON public.communication_delivery_log
FOR EACH ROW EXECUTE FUNCTION public.reconcile_communication_delivery_events();

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_delivery(
  p_recipient_user_id uuid,
  p_phone text,
  p_message_body text,
  p_template_name text,
  p_template_language text,
  p_template_variables jsonb,
  p_source_type text,
  p_source_id text,
  p_school_id uuid,
  p_class_id uuid,
  p_created_by uuid,
  p_idempotency_key text
)
RETURNS TABLE(outbox_id uuid, delivery_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id uuid;
  v_delivery_id uuid;
  v_delivery_key text;
BEGIN
  INSERT INTO public.whatsapp_outbox(
    recipient_user_id, phone, message_body, template_name, template_language,
    template_variables, source_type, source_id, school_id, class_id, created_by,
    idempotency_key, status, next_attempt_at
  ) VALUES (
    p_recipient_user_id, p_phone, p_message_body, p_template_name,
    COALESCE(nullif(p_template_language, ''), 'en'), COALESCE(p_template_variables, '[]'::jsonb),
    p_source_type,
    CASE WHEN COALESCE(p_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN p_source_id::uuid ELSE NULL END,
    p_school_id, p_class_id, p_created_by, p_idempotency_key, 'queued', now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_outbox_id;

  IF v_outbox_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_outbox_id FROM public.whatsapp_outbox WHERE idempotency_key = p_idempotency_key;
  END IF;
  IF v_outbox_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unable to create WhatsApp outbox record';
  END IF;

  v_delivery_key := 'whatsapp-outbox:' || v_outbox_id::text;
  INSERT INTO public.communication_delivery_log(
    channel, recipient, recipient_user_id, school_id, outbox_id, provider,
    status, automated, template_key, source_type, source_id, idempotency_key,
    queued_at, metadata, updated_at
  ) VALUES (
    'whatsapp', p_phone, p_recipient_user_id, p_school_id, v_outbox_id, 'meta',
    'queued', true, p_template_name, p_source_type, p_source_id, v_delivery_key,
    now(), jsonb_build_object('outbox_id', v_outbox_id, 'class_id', p_class_id), now()
  )
  ON CONFLICT (channel, idempotency_key) DO UPDATE SET outbox_id = EXCLUDED.outbox_id
  RETURNING id INTO v_delivery_id;

  UPDATE public.whatsapp_outbox SET delivery_log_id = v_delivery_id WHERE id = v_outbox_id;
  PERFORM public.record_communication_delivery_event(
    v_delivery_id, v_delivery_key || ':queued', 'queued', 'whatsapp', 'meta',
    NULL, 'queued', now(), NULL, jsonb_build_object('outbox_id', v_outbox_id, 'attempt_number', 0)
  );
  RETURN QUERY SELECT v_outbox_id, v_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_whatsapp_delivery(uuid, text, text, text, text, jsonb, text, text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_whatsapp_delivery(uuid, text, text, text, text, jsonb, text, text, uuid, uuid, uuid, text) TO service_role;

COMMENT ON TABLE public.communication_delivery_events IS
  'Append-only provider and queue event history for the canonical communication delivery ledger.';

