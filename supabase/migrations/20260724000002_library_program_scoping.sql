-- 1. Add program_id to content_library
ALTER TABLE public.content_library
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_program_id ON public.content_library(program_id);

-- 2. Drop and recreate select policy to enforce program scoping
DROP POLICY IF EXISTS "Users can view content" ON public.content_library;

CREATE POLICY "Users can view content" ON public.content_library
  FOR SELECT TO authenticated
  USING (
    (
      is_approved = true
      AND (
        school_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.portal_users pu
          WHERE pu.id = auth.uid() AND pu.school_id = content_library.school_id
        )
      )
      AND (
        program_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.user_id = auth.uid()
            AND e.status = 'active'
            AND e.program_id = content_library.program_id
        )
      )
    )
    OR public.is_staff()
    OR auth.uid() = created_by
  );
