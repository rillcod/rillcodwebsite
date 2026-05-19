-- ─────────────────────────────────────────────────────────────────────────────
-- parent_student_links
-- Explicit junction table that survives email changes, supports multi-child
-- parents, and gives RLS a stable FK-based join instead of an email match.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES public.students(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_psl_parent_id  ON public.parent_student_links (parent_id);
CREATE INDEX IF NOT EXISTS idx_psl_student_id ON public.parent_student_links (student_id);

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

-- Staff (admin / teacher / school) can read all links
DROP POLICY IF EXISTS "staff_read_parent_links" ON public.parent_student_links;
CREATE POLICY "staff_read_parent_links" ON public.parent_student_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- Parent sees only their own links
DROP POLICY IF EXISTS "parent_read_own_links" ON public.parent_student_links;
CREATE POLICY "parent_read_own_links" ON public.parent_student_links
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

-- Staff can insert / update / delete links
DROP POLICY IF EXISTS "staff_write_parent_links" ON public.parent_student_links;
CREATE POLICY "staff_write_parent_links" ON public.parent_student_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school')
    )
  );

-- ── 2. Backfill from students.parent_email ────────────────────────────────────
-- Every student with a parent_email that resolves to an active parent account
-- gets an explicit link row, so legacy data is not lost.
INSERT INTO public.parent_student_links (parent_id, student_id)
SELECT pu.id, s.id
FROM   public.students s
JOIN   public.portal_users pu
       ON  lower(pu.email) = lower(s.parent_email)
       AND pu.role = 'parent'
       AND pu.is_active = true
WHERE  s.parent_email IS NOT NULL
  AND  s.parent_email <> ''
ON CONFLICT (parent_id, student_id) DO NOTHING;

-- ── 3. Email cascade trigger ──────────────────────────────────────────────────
-- When a parent's email is updated in portal_users, keep students.parent_email
-- in sync so the legacy email-based path stays consistent with the new table.
CREATE OR REPLACE FUNCTION public.sync_parent_email_on_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND OLD.role = 'parent' THEN
    UPDATE public.students
    SET    parent_email = NEW.email,
           updated_at   = now()
    WHERE  lower(parent_email) = lower(OLD.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_parent_email ON public.portal_users;
CREATE TRIGGER trg_sync_parent_email
  AFTER UPDATE OF email ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.sync_parent_email_on_update();

-- ── 4. Update RLS helper functions to union explicit + email links ────────────
-- Parents whose link was created before the explicit table existed will still
-- resolve via the email path. New links resolve via the junction table and
-- survive email changes.
CREATE OR REPLACE FUNCTION public.get_parent_student_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Explicit junction table (primary — survives email changes)
  SELECT psl.student_id
  FROM   public.parent_student_links psl
  WHERE  psl.parent_id = auth.uid()
  UNION
  -- Email-based fallback (legacy denormalized path)
  SELECT s.id
  FROM   public.students s
  JOIN   public.portal_users pu ON pu.id = auth.uid()
  WHERE  lower(s.parent_email) = lower(pu.email)
    AND  pu.role = 'parent'
    AND  pu.email IS NOT NULL
    AND  pu.email <> '';
$$;

CREATE OR REPLACE FUNCTION public.get_parent_child_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.user_id
  FROM   public.students s
  WHERE  s.id IN (SELECT public.get_parent_student_ids())
    AND  s.user_id IS NOT NULL;
$$;
