-- Normalize contact book phones/emails, dedupe safely, enforce uniqueness.

CREATE OR REPLACE FUNCTION public.normalize_contact_book_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  digits := regexp_replace(raw, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;
  IF length(digits) = 11 AND digits LIKE '0%' THEN
    digits := '234' || substring(digits from 2);
  ELSIF length(digits) = 10 THEN
    digits := '234' || digits;
  END IF;
  RETURN digits;
END;
$$;

UPDATE public.customer_contact_book
SET phone = public.normalize_contact_book_phone(phone)
WHERE phone IS NOT NULL;

UPDATE public.customer_contact_book
SET email = lower(btrim(email))
WHERE email IS NOT NULL;

-- Repoint CRM + form rows from duplicate book ids onto the keeper, then delete dupes.
CREATE OR REPLACE FUNCTION public.repoint_contact_book_dupe(dupe_id uuid, keep_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF dupe_id IS NULL OR keep_id IS NULL OR dupe_id = keep_id THEN
    RETURN;
  END IF;

  UPDATE public.form_leads
  SET contact_id = keep_id
  WHERE contact_id = dupe_id;

  UPDATE public.crm_interactions
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  UPDATE public.crm_attachments
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  UPDATE public.crm_tasks
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  UPDATE public.crm_opportunities
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  IF EXISTS (
    SELECT 1 FROM public.crm_pipeline WHERE contact_id = keep_id::text
  ) THEN
    DELETE FROM public.crm_pipeline WHERE contact_id = dupe_id::text;
  ELSE
    UPDATE public.crm_pipeline
    SET contact_id = keep_id::text
    WHERE contact_id = dupe_id::text;
  END IF;

  DELETE FROM public.customer_contact_book WHERE id = dupe_id;
END;
$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    WITH dup_emails AS (
      SELECT lower(btrim(email)) AS norm_email
      FROM public.customer_contact_book
      WHERE email IS NOT NULL AND btrim(email) <> ''
      GROUP BY 1
      HAVING count(*) > 1
    ),
    keepers AS (
      SELECT DISTINCT ON (lower(btrim(b.email)))
        b.id AS keep_id,
        lower(btrim(b.email)) AS norm_email
      FROM public.customer_contact_book b
      INNER JOIN dup_emails d ON lower(btrim(b.email)) = d.norm_email
      ORDER BY lower(btrim(b.email)), b.updated_at DESC NULLS LAST, b.created_at DESC
    )
    SELECT b.id AS dupe_id, k.keep_id
    FROM public.customer_contact_book b
    INNER JOIN keepers k ON lower(btrim(b.email)) = k.norm_email
    WHERE b.id <> k.keep_id
  LOOP
    PERFORM public.repoint_contact_book_dupe(rec.dupe_id, rec.keep_id);
  END LOOP;

  FOR rec IN
    WITH dup_phones AS (
      SELECT phone AS norm_phone
      FROM public.customer_contact_book
      WHERE phone IS NOT NULL AND btrim(phone) <> ''
      GROUP BY 1
      HAVING count(*) > 1
    ),
    keepers AS (
      SELECT DISTINCT ON (b.phone)
        b.id AS keep_id,
        b.phone AS norm_phone
      FROM public.customer_contact_book b
      INNER JOIN dup_phones d ON b.phone = d.norm_phone
      ORDER BY b.phone, b.updated_at DESC NULLS LAST, b.created_at DESC
    )
    SELECT b.id AS dupe_id, k.keep_id
    FROM public.customer_contact_book b
    INNER JOIN keepers k ON b.phone = k.norm_phone
    WHERE b.id <> k.keep_id
  LOOP
    PERFORM public.repoint_contact_book_dupe(rec.dupe_id, rec.keep_id);
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_book_email_uidx
  ON public.customer_contact_book (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_book_phone_uidx
  ON public.customer_contact_book (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
