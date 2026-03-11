-- Add manual grading support to CBT
ALTER TABLE public.cbt_sessions 
  ADD COLUMN IF NOT EXISTS needs_grading BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS grading_notes TEXT;

-- Update status constraint to include pending_grading
ALTER TABLE public.cbt_sessions DROP CONSTRAINT IF EXISTS cbt_sessions_status_check;
ALTER TABLE public.cbt_sessions ADD CONSTRAINT cbt_sessions_status_check 
  CHECK (status IN ('in_progress', 'completed', 'abandoned', 'passed', 'failed', 'pending_grading'));

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_needs_grading ON public.cbt_sessions(needs_grading) WHERE (needs_grading = true);
