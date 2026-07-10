-- Deleting a user (auth.users) was blocked by registration_batches.created_by, whose FK had
-- NO ACTION — so hard-deleting any staff member who had ever registered students failed with
-- "violates foreign key constraint registration_batches_created_by_fkey".
-- Fix: ON DELETE SET NULL — the batch (registration history) is preserved, just unattributed.
ALTER TABLE public.registration_batches ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.registration_batches
  DROP CONSTRAINT IF EXISTS registration_batches_created_by_fkey;

ALTER TABLE public.registration_batches
  ADD CONSTRAINT registration_batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
