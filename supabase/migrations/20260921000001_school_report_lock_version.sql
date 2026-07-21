-- Optimistic locking for concurrent school report editing (audit Phase 1).

ALTER TABLE public.school_performance_reports
  ADD COLUMN IF NOT EXISTS lock_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.school_performance_reports.lock_version IS
  'Incremented on each successful PATCH; clients must send expectedRevision to avoid last-write-wins overwrites.';
