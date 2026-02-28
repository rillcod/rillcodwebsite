-- Test Database Connection and Admin Login
-- This script verifies the database setup and admin access

-- ========================================
-- STEP 1: VERIFY ADMIN USER
-- ========================================

-- Check if admin user exists
SELECT 
    id,
    email,
    full_name,
    role,
    is_active,
    created_at
FROM portal_users 
WHERE role = 'admin'
AND email = 'admin@rillcod.com';

-- ========================================
-- STEP 2: VERIFY RLS POLICIES
-- ========================================

-- Check RLS policies for admin access
SELECT 
    tablename,
    policyname,
    permissive,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename IN ('portal_users', 'schools', 'students', 'report_templates', 'generated_reports')
ORDER BY tablename, policyname;

-- ========================================
-- STEP 3: TEST ADMIN ACCESS
-- ========================================

-- Test admin access to all tables
DO $$
DECLARE
    v_admin_id UUID;
    v_test_result BOOLEAN;
BEGIN
    -- Get admin user ID
    SELECT id INTO v_admin_id
    FROM portal_users
    WHERE role = 'admin'
    AND email = 'admin@rillcod.com';

    -- Test portal_users access
    SELECT EXISTS (
        SELECT 1 FROM portal_users
        WHERE id = v_admin_id
    ) INTO v_test_result;
    
    RAISE NOTICE 'Admin can access portal_users: %', v_test_result;

    -- Test schools access
    SELECT EXISTS (
        SELECT 1 FROM schools
        LIMIT 1
    ) INTO v_test_result;
    
    RAISE NOTICE 'Admin can access schools: %', v_test_result;

    -- Test students access
    SELECT EXISTS (
        SELECT 1 FROM students
        LIMIT 1
    ) INTO v_test_result;
    
    RAISE NOTICE 'Admin can access students: %', v_test_result;

    -- Test report_templates access
    SELECT EXISTS (
        SELECT 1 FROM report_templates
        LIMIT 1
    ) INTO v_test_result;
    
    RAISE NOTICE 'Admin can access report_templates: %', v_test_result;

    -- Test generated_reports access
    SELECT EXISTS (
        SELECT 1 FROM generated_reports
        LIMIT 1
    ) INTO v_test_result;
    
    RAISE NOTICE 'Admin can access generated_reports: %', v_test_result;
END $$;

-- ========================================
-- STEP 4: VERIFY HELPER FUNCTIONS
-- ========================================

-- Test create_user_notification function
DO $$
DECLARE
    v_admin_id UUID;
    v_notification_id UUID;
BEGIN
    -- Get admin user ID
    SELECT id INTO v_admin_id
    FROM portal_users
    WHERE role = 'admin'
    AND email = 'admin@rillcod.com';

    -- Test notification creation
    SELECT create_user_notification(
        v_admin_id,
        'Test Notification',
        'This is a test notification',
        'info'
    ) INTO v_notification_id;

    RAISE NOTICE 'Created test notification with ID: %', v_notification_id;

    -- Verify notification was created
    SELECT EXISTS (
        SELECT 1 FROM notifications
        WHERE id = v_notification_id
    ) INTO v_test_result;
    
    RAISE NOTICE 'Notification was created successfully: %', v_test_result;
END $$;

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CONNECTION TEST COMPLETED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Please check the results above to verify:';
    RAISE NOTICE '1. Admin user exists and is active';
    RAISE NOTICE '2. RLS policies are properly configured';
    RAISE NOTICE '3. Admin has access to all tables';
    RAISE NOTICE '4. Helper functions are working';
    RAISE NOTICE '========================================';
END $$; 