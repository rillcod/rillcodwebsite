-- The audit trail must OUTLIVE the people it records. audit_logs.actor_id was already
-- ON DELETE SET NULL, but audit_logs.user_id was NO ACTION — which both (a) blocks deleting
-- any user who has audit entries (same bug class as registration_batches) and (b) would
-- otherwise force us to erase history. Set it to SET NULL so the entry is preserved
-- (unattributed) and deletion is never blocked.
ALTER TABLE public.audit_logs ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
