CREATE TABLE IF NOT EXISTS public.billing_document_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_ref text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('payment_register', 'attendance_roster', 'billing_statement')),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name text,
  term_label text,
  amount numeric,
  currency text DEFAULT 'NGN',
  invoice_number text,
  student_count integer,
  period_label text,
  due_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_document_archive_doc_ref_uidx
  ON public.billing_document_archive (doc_ref);

CREATE INDEX IF NOT EXISTS billing_document_archive_school_created_idx
  ON public.billing_document_archive (school_id, created_at DESC);

ALTER TABLE public.billing_document_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_document_archive_admin_all ON public.billing_document_archive;
CREATE POLICY billing_document_archive_admin_all
  ON public.billing_document_archive
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
  );

DROP POLICY IF EXISTS billing_document_archive_school_read ON public.billing_document_archive;
CREATE POLICY billing_document_archive_school_read
  ON public.billing_document_archive
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'school'
        AND pu.school_id IS NOT NULL
        AND pu.school_id = billing_document_archive.school_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_document_archive TO authenticated;
GRANT ALL ON public.billing_document_archive TO service_role;
