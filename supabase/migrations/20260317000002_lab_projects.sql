-- Create a table for saving lab/playground projects
CREATE TABLE IF NOT EXISTS lab_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    language TEXT NOT NULL, -- 'javascript', 'python', 'html', 'scratch', 'robotics'
    code TEXT,
    blocks_xml TEXT, -- For Blockly state
    preview_url TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lab_projects
ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;

COMMENT ON COLUMN lab_projects.lesson_id IS 'Associates this project with a specific lesson';
COMMENT ON COLUMN lab_projects.assignment_id IS 'Associates this project with a specific assignment';

-- Helper for lab management
CREATE OR REPLACE FUNCTION is_admin_or_teacher() RETURNS boolean AS $$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher') FROM public.portal_users WHERE id = auth.uid());
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS
ALTER TABLE lab_projects ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own projects" ON lab_projects
    FOR SELECT USING (auth.uid() = user_id OR is_admin_or_teacher());

CREATE POLICY "Users can create their own projects" ON lab_projects
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin_or_teacher());

CREATE POLICY "Users can update their own projects" ON lab_projects
    FOR UPDATE USING (auth.uid() = user_id OR is_admin_or_teacher());

CREATE POLICY "Users can delete their own projects" ON lab_projects
    FOR DELETE USING (auth.uid() = user_id OR is_admin_or_teacher());

-- If someone makes a project public, others can see it
CREATE POLICY "Public projects are viewable by all" ON lab_projects
    FOR SELECT USING (is_public = true);
