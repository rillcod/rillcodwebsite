-- Persist printable HTML with archived billing docs so they can be reopened later.
ALTER TABLE public.billing_document_archive
  ADD COLUMN IF NOT EXISTS html_body text;

COMMENT ON COLUMN public.billing_document_archive.html_body IS
  'Full printable HTML snapshot of the generated billing document.';
