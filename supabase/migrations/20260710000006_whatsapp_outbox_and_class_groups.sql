-- Durable WhatsApp delivery and class-owned group binding.

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_teacher_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL;

WITH matches AS (
  SELECT wg.id AS group_id, c.id AS class_id, c.teacher_id,
         row_number() OVER (PARTITION BY wg.id ORDER BY c.updated_at DESC NULLS LAST, c.id) AS rn
  FROM public.whatsapp_groups wg
  JOIN public.classes c ON c.school_id = wg.school_id
   AND lower(btrim(c.name)) = lower(btrim(wg.class_name))
  WHERE wg.class_id IS NULL AND wg.class_name IS NOT NULL
)
UPDATE public.whatsapp_groups wg
SET class_id = matches.class_id, owner_teacher_id = matches.teacher_id
FROM matches WHERE wg.id = matches.group_id AND matches.rn = 1;

UPDATE public.whatsapp_groups wg
SET owner_teacher_id = c.teacher_id, school_id = c.school_id, class_name = c.name
FROM public.classes c WHERE wg.class_id = c.id;

CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_class ON public.whatsapp_groups(class_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_owner ON public.whatsapp_groups(owner_teacher_id, status);

CREATE OR REPLACE FUNCTION public.guard_whatsapp_group_class_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE linked_class public.classes;
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO linked_class FROM public.classes WHERE id = NEW.class_id;
    IF linked_class.id IS NULL THEN RAISE EXCEPTION 'WhatsApp group class does not exist'; END IF;
    NEW.school_id := linked_class.school_id;
    NEW.class_name := linked_class.name;
    NEW.owner_teacher_id := linked_class.teacher_id;
  ELSIF NEW.group_type = 'class' THEN
    RAISE EXCEPTION 'Class WhatsApp groups require class_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_whatsapp_group_class_owner ON public.whatsapp_groups;
CREATE TRIGGER trg_guard_whatsapp_group_class_owner
BEFORE INSERT OR UPDATE OF class_id, group_type ON public.whatsapp_groups
FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_group_class_owner();

CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message_body text NOT NULL,
  template_name text,
  template_language text NOT NULL DEFAULT 'en',
  template_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','retry','sent','delivered','read','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  meta_message_id text,
  last_error text,
  source_type text,
  source_id uuid,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_ready ON public.whatsapp_outbox(status, next_attempt_at, created_at)
  WHERE status IN ('queued','retry');
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_meta ON public.whatsapp_outbox(meta_message_id) WHERE meta_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_class ON public.whatsapp_outbox(class_id, created_at DESC);

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_outbox FROM anon, authenticated;
GRANT ALL ON public.whatsapp_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox(p_limit integer DEFAULT 20)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.whatsapp_outbox
    WHERE status IN ('queued','retry') AND next_attempt_at <= now() AND attempts < max_attempts
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
  )
  UPDATE public.whatsapp_outbox outbox
  SET status = 'processing', attempts = outbox.attempts + 1, updated_at = now()
  FROM claimed WHERE outbox.id = claimed.id
  RETURNING outbox.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbox(integer) TO service_role;