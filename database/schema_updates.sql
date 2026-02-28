-- Schema Updates for Report Templates and Additional Features
-- This script adds new tables and features to the existing schema

-- ========================================
-- NEW TABLES
-- ========================================

-- Report Templates Table
CREATE TABLE IF NOT EXISTS report_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_content JSONB NOT NULL,
    created_by UUID REFERENCES portal_users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generated Reports Table
CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID REFERENCES report_templates(id),
    program_id UUID REFERENCES programs(id),
    generated_by UUID REFERENCES portal_users(id),
    report_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- INDEXES
-- ========================================

-- Report Templates Indexes
CREATE INDEX IF NOT EXISTS idx_report_templates_created_by ON report_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_report_templates_is_active ON report_templates(is_active);

-- Generated Reports Indexes
CREATE INDEX IF NOT EXISTS idx_generated_reports_template_id ON generated_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_program_id ON generated_reports(program_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_by ON generated_reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_generated_reports_status ON generated_reports(status);

-- ========================================
-- TRIGGERS
-- ========================================

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply Updated At Trigger to New Tables
CREATE TRIGGER update_report_templates_updated_at
    BEFORE UPDATE ON report_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_reports_updated_at
    BEFORE UPDATE ON generated_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Create User Notification Function
CREATE OR REPLACE FUNCTION create_user_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type VARCHAR(50) DEFAULT 'info'
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_title,
        p_message,
        p_type,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enroll User in Program Function
CREATE OR REPLACE FUNCTION enroll_user_in_program(
    p_user_id UUID,
    p_program_id UUID,
    p_role VARCHAR(50) DEFAULT 'student'
)
RETURNS UUID AS $$
DECLARE
    v_enrollment_id UUID;
BEGIN
    -- Create enrollment
    INSERT INTO program_enrollments (
        user_id,
        program_id,
        role,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_program_id,
        p_role,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_enrollment_id;
    
    -- Create notification
    PERFORM create_user_notification(
        p_user_id,
        'Program Enrollment',
        'You have been enrolled in a new program.',
        'success'
    );
    
    RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- RLS POLICIES
-- ========================================

-- Enable RLS
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

-- Report Templates Policies
CREATE POLICY "report_templates_admin_access"
ON report_templates
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM portal_users
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "report_templates_view_access"
ON report_templates
FOR SELECT
TO authenticated
USING (is_active = true);

-- Generated Reports Policies
CREATE POLICY "generated_reports_admin_access"
ON generated_reports
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM portal_users
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "generated_reports_program_access"
ON generated_reports
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM program_enrollments
        WHERE user_id = auth.uid()
        AND program_id = generated_reports.program_id
    )
);

-- ========================================
-- GRANTS
-- ========================================

-- Grant permissions to authenticated users
GRANT ALL ON report_templates TO authenticated;
GRANT ALL ON generated_reports TO authenticated;

-- Grant permissions to anonymous users
GRANT SELECT ON report_templates TO anon;
GRANT SELECT ON generated_reports TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SCHEMA UPDATES COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'New tables added: report_templates, generated_reports';
    RAISE NOTICE 'Indexes created for performance optimization';
    RAISE NOTICE 'Triggers added for updated_at timestamps';
    RAISE NOTICE 'Helper functions created for common operations';
    RAISE NOTICE 'RLS policies implemented for security';
    RAISE NOTICE '========================================';
END $$; 