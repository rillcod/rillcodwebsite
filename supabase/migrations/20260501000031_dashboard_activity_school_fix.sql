-- Update get_dashboard_activity to support school roles
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

  ELSIF (user_role = 'teacher' OR user_role = 'instructor') THEN
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

  ELSIF (user_role = 'school' OR user_role = 'school_admin') THEN
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
    WHERE u.school_id = (SELECT school_id FROM portal_users WHERE id = user_uuid)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
