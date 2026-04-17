-- Dashboard Performance Optimization Migration
-- Adds indexes, views, and RPC functions to dramatically improve dashboard load times

-- ============================================================================
-- PART 1: CRITICAL INDEXES
-- ============================================================================

-- Assignment submissions lookups (used heavily in all dashboards)
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_status 
ON assignment_submissions(portal_user_id, status, submitted_at DESC) 
WHERE portal_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_id_status 
ON assignment_submissions(user_id, status, submitted_at DESC) 
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_status 
ON assignment_submissions(assignment_id, status, grade) 
WHERE grade IS NOT NULL;

-- CBT sessions lookups
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user_status 
ON cbt_sessions(user_id, status, end_time DESC);

CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam_status 
ON cbt_sessions(exam_id, status, score) 
WHERE score IS NOT NULL;

-- Teacher/School relationships
CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher 
ON teacher_schools(teacher_id, school_id);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_school 
ON classes(teacher_id, school_id);

CREATE INDEX IF NOT EXISTS idx_students_school_lookup 
ON students(school_id, user_id) 
WHERE school_id IS NOT NULL;

-- Portal users role-based lookups
CREATE INDEX IF NOT EXISTS idx_portal_users_role_active 
ON portal_users(role, is_active, school_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_portal_users_school 
ON portal_users(school_id, role) 
WHERE school_id IS NOT NULL;

-- Enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_user 
ON enrollments(user_id, program_id);

-- User points (leaderboard)
CREATE INDEX IF NOT EXISTS idx_user_points_leaderboard 
ON user_points(total_points DESC, portal_user_id);

-- Lesson progress
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_status 
ON lesson_progress(portal_user_id, status, completed_at DESC);

-- Assignments due dates
CREATE INDEX IF NOT EXISTS idx_assignments_due_date 
ON assignments(due_date, status) 
WHERE due_date IS NOT NULL;

-- ============================================================================
-- PART 2: MATERIALIZED VIEWS FOR DASHBOARD STATS
-- ============================================================================

-- Admin Dashboard Stats View
CREATE MATERIALIZED VIEW IF NOT EXISTS admin_dashboard_stats AS
SELECT 
  (SELECT COUNT(*) FROM schools) as total_schools,
  (SELECT COUNT(*) FROM schools WHERE status = 'active') as active_schools,
  (SELECT COUNT(*) FROM portal_users WHERE role = 'teacher' AND is_active = true) as total_teachers,
  (SELECT COUNT(*) FROM students) as total_students,
  (SELECT COUNT(*) FROM portal_users WHERE role = 'school' AND is_active = true) as total_partners,
  (SELECT COUNT(*) FROM assignment_submissions WHERE grade IS NOT NULL) as graded_assignments,
  (SELECT COUNT(*) FROM cbt_sessions WHERE score IS NOT NULL) as graded_cbt,
  NOW() as last_updated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_dashboard_stats_unique ON admin_dashboard_stats((1));

-- ============================================================================
-- PART 3: RPC FUNCTIONS FOR OPTIMIZED QUERIES
-- ============================================================================

-- Get teacher dashboard stats in single call
CREATE OR REPLACE FUNCTION get_teacher_dashboard_stats(teacher_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  school_ids UUID[];
  school_names TEXT[];
  assignment_ids UUID[];
  exam_ids UUID[];
BEGIN
  -- Get teacher's schools
  SELECT ARRAY_AGG(DISTINCT school_id) INTO school_ids
  FROM (
    SELECT school_id FROM portal_users WHERE id = teacher_uuid
    UNION
    SELECT school_id FROM teacher_schools WHERE teacher_id = teacher_uuid
    UNION
    SELECT school_id FROM classes WHERE teacher_id = teacher_uuid
  ) schools WHERE school_id IS NOT NULL;

  -- Get school names
  SELECT ARRAY_AGG(DISTINCT name) INTO school_names
  FROM schools WHERE id = ANY(school_ids);

  -- Get teacher's assignments and exams
  SELECT ARRAY_AGG(id) INTO assignment_ids FROM assignments WHERE created_by = teacher_uuid;
  SELECT ARRAY_AGG(id) INTO exam_ids FROM cbt_exams WHERE created_by = teacher_uuid;

  -- Build result
  SELECT json_build_object(
    'classes', (
      SELECT COUNT(*) FROM classes 
      WHERE teacher_id = teacher_uuid 
         OR (school_ids IS NOT NULL AND school_id = ANY(school_ids))
    ),
    'portal_students', (
      SELECT COUNT(*) FROM portal_users 
      WHERE role = 'student' 
        AND (school_ids IS NOT NULL AND school_id = ANY(school_ids))
    ),
    'registry_students', (
      SELECT COUNT(*) FROM students 
      WHERE user_id IS NULL 
        AND (
          (school_ids IS NOT NULL AND school_id = ANY(school_ids))
          OR (school_names IS NOT NULL AND school_name = ANY(school_names))
        )
    ),
    'pending_assignments', (
      SELECT COUNT(*) FROM assignment_submissions 
      WHERE assignment_id = ANY(assignment_ids) 
        AND status = 'submitted' 
        AND grade IS NULL
    ),
    'pending_exams', (
      SELECT COUNT(*) FROM cbt_sessions 
      WHERE exam_id = ANY(exam_ids) 
        AND needs_grading = true
    ),
    'avg_grade', (
      SELECT COALESCE(AVG(grade), 0)::INTEGER 
      FROM assignment_submissions 
      WHERE assignment_id = ANY(assignment_ids) 
        AND grade IS NOT NULL
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get student dashboard stats in single call
CREATE OR REPLACE FUNCTION get_student_dashboard_stats(student_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'enrolled_courses', (
      SELECT COUNT(*) FROM enrollments WHERE user_id = student_uuid
    ),
    'xp_points', (
      SELECT COALESCE(total_points, 0) FROM user_points WHERE portal_user_id = student_uuid
    ),
    'current_streak', (
      SELECT COALESCE(current_streak, 0) FROM user_points WHERE portal_user_id = student_uuid
    ),
    'achievement_level', (
      SELECT COALESCE(achievement_level, 'Bronze') FROM user_points WHERE portal_user_id = student_uuid
    ),
    'lessons_completed', (
      SELECT COUNT(*) FROM lesson_progress 
      WHERE portal_user_id = student_uuid AND status = 'completed'
    ),
    'pending_assignments', (
      SELECT COUNT(*) FROM assignment_submissions 
      WHERE portal_user_id = student_uuid 
        AND status = 'submitted' 
        AND grade IS NULL
    ),
    'avg_score', (
      SELECT COALESCE(
        AVG((grade::FLOAT / NULLIF(a.max_points, 0)) * 100)::INTEGER, 
        0
      )
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.portal_user_id = student_uuid 
        AND s.grade IS NOT NULL
    ),
    'badges_count', (
      SELECT COUNT(*) FROM user_badges WHERE portal_user_id = student_uuid
    ),
    'leaderboard_rank', (
      SELECT rank FROM (
        SELECT portal_user_id, 
               ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank
        FROM user_points
      ) lb WHERE portal_user_id = student_uuid
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get school dashboard stats in single call
CREATE OR REPLACE FUNCTION get_school_dashboard_stats(school_uuid UUID, school_name_param TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_students', (
      SELECT COUNT(*) FROM students 
      WHERE school_id = school_uuid 
         OR (school_name_param IS NOT NULL AND school_name = school_name_param)
    ),
    'portal_students', (
      SELECT COUNT(*) FROM portal_users 
      WHERE role = 'student' AND school_id = school_uuid
    ),
    'assigned_teachers', (
      SELECT COUNT(*) FROM teacher_schools WHERE school_id = school_uuid
    ),
    'total_classes', (
      SELECT COUNT(*) FROM classes WHERE school_id = school_uuid
    ),
    'avg_performance', (
      SELECT COALESCE(AVG(s.grade)::INTEGER, 0)
      FROM assignment_submissions s
      JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
      WHERE u.school_id = school_uuid AND s.grade IS NOT NULL
    ),
    'submissions_count', (
      SELECT COUNT(*)
      FROM assignment_submissions s
      JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
      WHERE u.school_id = school_uuid AND s.grade IS NOT NULL
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get enriched activity feed (avoids N+1 queries)
CREATE OR REPLACE FUNCTION get_dashboard_activity(
  user_role TEXT,
  user_uuid UUID,
  activity_limit INTEGER DEFAULT 6
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  time_ago TEXT,
  icon_type TEXT,
  color_class TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF user_role = 'admin' THEN
    RETURN QUERY
    SELECT 
      s.id,
      COALESCE(u.full_name, 'Student') || ' submitted' as title,
      COALESCE(a.title, '—') as description,
      CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::TEXT || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::TEXT || 'h ago'
        ELSE 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::TEXT || 'd ago'
      END as time_ago,
      'submission' as icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END as color_class,
      s.submitted_at as created_at
    FROM assignment_submissions s
    LEFT JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
    LEFT JOIN assignments a ON a.id = s.assignment_id
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;

  ELSIF user_role = 'teacher' THEN
    RETURN QUERY
    SELECT 
      s.id,
      COALESCE(u.full_name, 'Student') || ' submitted' as title,
      COALESCE(a.title, '—') as description,
      CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::TEXT || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::TEXT || 'h ago'
        ELSE 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::TEXT || 'd ago'
      END as time_ago,
      'submission' as icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END as color_class,
      s.submitted_at as created_at
    FROM assignment_submissions s
    LEFT JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE a.created_by = user_uuid
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;

  ELSIF user_role = 'student' THEN
    RETURN QUERY
    SELECT 
      s.id,
      CASE WHEN s.status = 'graded' THEN 'Grade received' ELSE 'Assignment submitted' END as title,
      COALESCE(a.title, '—') || 
        CASE WHEN s.grade IS NOT NULL 
          THEN ' · ' || s.grade::TEXT || '/' || COALESCE(a.max_points, 100)::TEXT 
          ELSE '' 
        END as description,
      CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::TEXT || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::TEXT || 'h ago'
        ELSE 
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::TEXT || 'd ago'
      END as time_ago,
      CASE WHEN s.status = 'graded' THEN 'trophy' ELSE 'submission' END as icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END as color_class,
      s.submitted_at as created_at
    FROM assignment_submissions s
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE s.portal_user_id = user_uuid
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 4: REFRESH FUNCTION FOR MATERIALIZED VIEWS
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY admin_dashboard_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_teacher_dashboard_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_dashboard_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_school_dashboard_stats(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_activity(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_dashboard_stats() TO service_role;

-- Initial refresh
SELECT refresh_dashboard_stats();

-- ============================================================================
-- PART 5: AUTOMATIC REFRESH TRIGGER (every 5 minutes)
-- ============================================================================

-- Note: This requires pg_cron extension. If not available, use a cron job or serverless function
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('refresh-dashboard-stats', '*/5 * * * *', 'SELECT refresh_dashboard_stats()');

COMMENT ON FUNCTION get_teacher_dashboard_stats IS 'Optimized single-query function to fetch all teacher dashboard stats';
COMMENT ON FUNCTION get_student_dashboard_stats IS 'Optimized single-query function to fetch all student dashboard stats';
COMMENT ON FUNCTION get_school_dashboard_stats IS 'Optimized single-query function to fetch all school dashboard stats';
COMMENT ON FUNCTION get_dashboard_activity IS 'Optimized activity feed with user enrichment to avoid N+1 queries';
