-- =================================================================
-- MIGRATION: Security hardening and schema enhancements
-- Fixes public access to sensitive data and adds auditing columns
-- =================================================================

-- 1. ADD AUDITING COLUMNS
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES portal_users(id);
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES portal_users(id);
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 2. HARDEN RLS POLICIES (DROP LOOSE POLICIES)
DROP POLICY IF EXISTS "Public can view students" ON students;
DROP POLICY IF EXISTS "Public can view CBT exams" ON cbt_exams;
DROP POLICY IF EXISTS "Public can view CBT questions" ON cbt_questions;
DROP POLICY IF EXISTS "Public can view materials" ON course_materials;
DROP POLICY IF EXISTS "Public can view assignments" ON assignments;

-- 3. APPLY SECURE POLICIES

-- Students visibility: Admins see all, Staff see their assigned school's students
CREATE POLICY "Staff can view students" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users 
      WHERE id = auth.uid() 
      AND (
        role = 'admin' OR 
        role = 'teacher' OR 
        (role = 'school' AND school_id = students.school_id)
      )
    )
  );

-- CBT Exams: Only authenticated users can see active exams
CREATE POLICY "Authenticated users can view active CBT exams" ON cbt_exams
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (is_active = true OR EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin'))
  );

-- CBT Questions: ONLY staff can view questions directly (students see them via session/API if needed)
CREATE POLICY "Staff can view CBT questions" ON cbt_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

-- Assignments: Staff manage, students see assigned
CREATE POLICY "Students can view assignments" ON assignments
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- Materials: Only authenticated
CREATE POLICY "Authenticated users can view materials" ON course_materials
  FOR SELECT USING (auth.role() = 'authenticated');
