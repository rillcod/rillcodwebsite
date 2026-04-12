-- Migration Refinement for Announcements and Newsletters
-- 20260317000003_schema_refinements.sql

-- 1. Update announcements target_audience constraint to include 'schools'
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_target_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_target_audience_check 
    CHECK (target_audience = ANY (ARRAY['all', 'students', 'teachers', 'admins', 'schools']));

-- 2. Add school_id to announcements for better scoping
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 3. Add school_id to newsletters for better scoping
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 4. Update announcements RLS Policies
DROP POLICY IF EXISTS "All users can view announcements" ON announcements;
DROP POLICY IF EXISTS "Public can view announcements" ON announcements;

-- Everyone can see active announcements that are either global (admin author) or from their school
CREATE POLICY "Users can view relevant announcements" ON announcements
FOR SELECT TO authenticated
USING (
    is_active = true 
    AND (
        -- Global announcements from admin
        EXISTS (SELECT 1 FROM portal_users WHERE id = announcements.author_id AND role = 'admin')
        OR
        -- School-specific announcements
        EXISTS (
            SELECT 1 FROM portal_users u 
            WHERE u.id = auth.uid() 
            AND (
                -- Same school as author
                EXISTS (SELECT 1 FROM portal_users author WHERE author.id = announcements.author_id AND author.school_id = u.school_id)
                OR
                -- Attached directly to the same school
                announcements.school_id = u.school_id
            )
        )
    )
);

-- 5. Update Newsletters RLS Policies to allow School Partners
DROP POLICY IF EXISTS "Admins can manage newsletters" ON newsletters;

CREATE POLICY "Staff can manage newsletters" ON newsletters
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM portal_users 
        WHERE id = auth.uid() 
        AND (
            role = 'admin' 
            OR (role = 'school' AND (id = newsletters.author_id OR school_id = newsletters.school_id))
        )
    )
);

-- 6. Update lab_projects to use is_staff helper
DROP POLICY IF EXISTS "Users can view their own projects" ON lab_projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON lab_projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON lab_projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON lab_projects;

CREATE POLICY "Access projects" ON lab_projects
    FOR ALL TO authenticated USING (
        auth.uid() = user_id 
        OR EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
    );
