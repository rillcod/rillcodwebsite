-- ============================================================
-- Migration: Feedback System
-- Description: User feedback collection and management
-- ============================================================

-- ── Feedback table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.portal_users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_role TEXT,
  type TEXT NOT NULL CHECK (type IN ('suggestion', 'complaint', 'praise', 'question')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  admin_response TEXT,
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON public.feedback(rating);

-- ── RLS Policies ────────────────────────────────────────────
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "users_insert_own_feedback" ON public.feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can view their own feedback
CREATE POLICY "users_view_own_feedback" ON public.feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "admins_view_all_feedback" ON public.feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update feedback (add responses, change status)
CREATE POLICY "admins_update_feedback" ON public.feedback
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Trigger: Update updated_at ─────────────────────────────
CREATE OR REPLACE FUNCTION public.update_feedback_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_updated_at();

-- ── Grant permissions ───────────────────────────────────────
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

-- ── Comments ────────────────────────────────────────────────
COMMENT ON TABLE public.feedback IS 'User feedback collection system';
COMMENT ON COLUMN public.feedback.type IS 'Type of feedback: suggestion, complaint, praise, question';
COMMENT ON COLUMN public.feedback.rating IS 'User satisfaction rating (1-5 stars)';
COMMENT ON COLUMN public.feedback.status IS 'Feedback status: new, in_progress, resolved, closed';
