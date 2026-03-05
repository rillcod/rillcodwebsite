-- Add questions column to assignments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='assignments' AND column_name='questions'
  ) THEN
    ALTER TABLE public.assignments ADD COLUMN questions JSONB;
  END IF;
END $$;

-- Update RLS for assignments to be more robust
DROP POLICY IF EXISTS "Admins can manage assignments" ON assignments;
CREATE POLICY "Staff can manage assignments" ON assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );
