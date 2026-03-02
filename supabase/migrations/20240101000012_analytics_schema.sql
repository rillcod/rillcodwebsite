-- Analytics and Reporting Schema (Phase 10)

-- 1. Activity Logs for Engagement Tracking
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES portal_users(id),
    school_id UUID REFERENCES schools(id),
    event_type TEXT NOT NULL, -- 'login', 'page_view', 'lesson_view', 'video_play', etc.
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Performance Tracking Views
CREATE OR REPLACE VIEW student_performance_summary AS
SELECT 
    p.id as student_id,
    p.full_name,
    p.school_id,
    COUNT(DISTINCT e.program_id) as enrolled_programs,
    AVG(ea.percentage) as avg_exam_score,
    AVG(asub.grade) as avg_assignment_grade,
    COUNT(DISTINCT lp.lesson_id) filter (where lp.status = 'completed') as lessons_completed
FROM portal_users p
LEFT JOIN enrollments e ON p.id = e.user_id
LEFT JOIN exam_attempts ea ON p.id = ea.portal_user_id AND ea.status = 'graded'
LEFT JOIN assignment_submissions asub ON p.id = asub.user_id AND asub.status = 'graded'
LEFT JOIN lesson_progress lp ON p.id = lp.portal_user_id AND lp.status = 'completed'
WHERE p.role = 'student'
GROUP BY p.id, p.full_name, p.school_id;

-- 3. At-Risk Detection Function
CREATE OR REPLACE FUNCTION get_at_risk_students(p_school_id UUID, p_days_inactive INTEGER DEFAULT 7)
RETURNS TABLE (
    student_id UUID,
    full_name TEXT,
    last_login TIMESTAMPTZ,
    avg_grade NUMERIC,
    risk_level TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        MAX(al.created_at) as last_login,
        (COALESCE(avg_exam_score, 0) + COALESCE(avg_assignment_grade, 0)) / 2 as avg_grade,
        CASE 
            WHEN MAX(al.created_at) < NOW() - (p_days_inactive || ' days')::INTERVAL THEN 'High'
            WHEN (COALESCE(avg_exam_score, 0) + COALESCE(avg_assignment_grade, 0)) / 2 < 50 THEN 'High'
            WHEN MAX(al.created_at) < NOW() - (p_days_inactive/2 || ' days')::INTERVAL THEN 'Medium'
            ELSE 'Low'
        END as risk_level
    FROM portal_users p
    LEFT JOIN activity_logs al ON p.id = al.user_id AND al.event_type = 'login'
    LEFT JOIN student_performance_summary sps ON p.id = sps.student_id
    WHERE p.role = 'student' AND (p_school_id IS NULL OR p.school_id = p_school_id)
    GROUP BY p.id, p.full_name, sps.avg_exam_score, sps.avg_assignment_grade;
END;
$$ LANGUAGE plpgsql;

-- 5. Helper Functions for Course Averages
CREATE OR REPLACE FUNCTION get_course_avg_exam_score(p_course_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN (
        SELECT AVG(percentage)
        FROM exam_attempts
        WHERE exam_id IN (SELECT id FROM exams WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_course_avg_assignment_grade(p_course_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN (
        SELECT AVG(grade)
        FROM assignment_submissions
        WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$$ LANGUAGE plpgsql;

-- 6. RLS for Analytics
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Admins can view all logs" ON activity_logs FOR SELECT USING (
        EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
    );
    CREATE POLICY "Users can view their own logs" ON activity_logs FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;
