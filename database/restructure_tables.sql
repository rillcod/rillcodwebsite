-- Restructure Database to Use portal_users for All User Types
-- Remove redundant students table and use portal_users with role field

-- ========================================
-- STEP 1: BACKUP STUDENT DATA (if any)
-- ========================================

-- Create a backup of existing students data
CREATE TABLE IF NOT EXISTS students_backup AS 
SELECT * FROM students;

-- ========================================
-- STEP 2: ADD STUDENT FIELDS TO PORTAL_USERS
-- ========================================

-- Add student-specific fields to portal_users table
ALTER TABLE portal_users 
ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS school_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS grade_level VARCHAR(50);

-- ========================================
-- STEP 3: MIGRATE STUDENT DATA TO PORTAL_USERS
-- ========================================

-- Insert students from students table into portal_users
INSERT INTO portal_users (
    email,
    password_hash,
    full_name,
    role,
    is_active,
    parent_email,
    parent_phone,
    school_name,
    grade_level,
    created_at
)
SELECT 
    CONCAT(LOWER(REPLACE(full_name, ' ', '.')), '@student.rillcod.com') as email,
    'YWRtaW4xMjM=' as password_hash, -- 'admin123' in base64
    full_name,
    'student' as role,
    CASE 
        WHEN status = 'approved' THEN true
        ELSE false
    END as is_active,
    parent_email,
    parent_phone,
    school_name,
    grade_level,
    created_at
FROM students
ON CONFLICT (email) DO NOTHING;

-- ========================================
-- STEP 4: ADD MORE SAMPLE STUDENTS TO PORTAL_USERS
-- ========================================

INSERT INTO portal_users (
    email,
    password_hash,
    full_name,
    role,
    is_active,
    parent_email,
    parent_phone,
    school_name,
    grade_level
) VALUES
('adebayo.oluwaseun@student.rillcod.com', 'YWRtaW4xMjM=', 'Adebayo Oluwaseun', 'student', true, 'adebayo.parent@email.com', '+234-811-234-5678', 'St. Mary''s High School', 'SS2'),
('chioma.nwosu@student.rillcod.com', 'YWRtaW4xMjM=', 'Chioma Nwosu', 'student', true, 'chioma.parent@email.com', '+234-812-345-6789', 'Federal Government College', 'SS1'),
('emeka.okonkwo@student.rillcod.com', 'YWRtaW4xMjM=', 'Emeka Okonkwo', 'student', false, 'emeka.parent@email.com', '+234-813-456-7890', 'Loyola Jesuit College', 'SS3'),
('fatima.ahmed@student.rillcod.com', 'YWRtaW4xMjM=', 'Fatima Ahmed', 'student', true, 'fatima.parent@email.com', '+234-814-567-8901', 'King''s College', 'SS2'),
('gabriel.okafor@student.rillcod.com', 'YWRtaW4xMjM=', 'Gabriel Okafor', 'student', true, 'gabriel.parent@email.com', '+234-815-678-9012', 'Queen''s College', 'SS1'),
('hassan.ibrahim@student.rillcod.com', 'YWRtaW4xMjM=', 'Hassan Ibrahim', 'student', false, 'hassan.parent@email.com', '+234-816-789-0123', 'Government Secondary School', 'SS3'),
('ijeoma.eze@student.rillcod.com', 'YWRtaW4xMjM=', 'Ijeoma Eze', 'student', true, 'ijeoma.parent@email.com', '+234-817-890-1234', 'St. Gregory''s College', 'SS2'),
('john.doe@student.rillcod.com', 'YWRtaW4xMjM=', 'John Doe', 'student', false, 'john.parent@email.com', '+234-818-901-2345', 'Federal Science and Technical College', 'SS1'),
('kemi.adebayo@student.rillcod.com', 'YWRtaW4xMjM=', 'Kemi Adebayo', 'student', true, 'kemi.parent@email.com', '+234-819-012-3456', 'St. Francis Catholic Secondary School', 'SS3'),
('lola.ogunlesi@student.rillcod.com', 'YWRtaW4xMjM=', 'Lola Ogunlesi', 'student', false, 'lola.parent@email.com', '+234-820-123-4567', 'Government Girls Secondary School', 'SS2'),
('mohammed.bello@student.rillcod.com', 'YWRtaW4xMjM=', 'Mohammed Bello', 'student', true, 'mohammed.parent@email.com', '+234-821-234-5678', 'St. Mary''s High School', 'SS1'),
('ngozi.okonkwo@student.rillcod.com', 'YWRtaW4xMjM=', 'Ngozi Okonkwo', 'student', true, 'ngozi.parent@email.com', '+234-822-345-6789', 'Federal Government College', 'SS3'),
('oluwaseun.adeyemi@student.rillcod.com', 'YWRtaW4xMjM=', 'Oluwaseun Adeyemi', 'student', false, 'oluwaseun.parent@email.com', '+234-823-456-7890', 'Loyola Jesuit College', 'SS2'),
('patience.uche@student.rillcod.com', 'YWRtaW4xMjM=', 'Patience Uche', 'student', true, 'patience.parent@email.com', '+234-824-567-8901', 'King''s College', 'SS1'),
('quadri.olalekan@student.rillcod.com', 'YWRtaW4xMjM=', 'Quadri Olalekan', 'student', true, 'quadri.parent@email.com', '+234-825-678-9012', 'Queen''s College', 'SS3'),
('rachael.okafor@student.rillcod.com', 'YWRtaW4xMjM=', 'Rachael Okafor', 'student', false, 'rachael.parent@email.com', '+234-826-789-0123', 'Government Secondary School', 'SS2'),
('samuel.adebayo@student.rillcod.com', 'YWRtaW4xMjM=', 'Samuel Adebayo', 'student', true, 'samuel.parent@email.com', '+234-827-890-1234', 'St. Gregory''s College', 'SS1'),
('temitope.johnson@student.rillcod.com', 'YWRtaW4xMjM=', 'Temitope Johnson', 'student', true, 'temitope.parent@email.com', '+234-828-901-2345', 'Federal Science and Technical College', 'SS3'),
('uchechi.nwosu@student.rillcod.com', 'YWRtaW4xMjM=', 'Uchechi Nwosu', 'student', false, 'uchechi.parent@email.com', '+234-829-012-3456', 'St. Francis Catholic Secondary School', 'SS2'),
('victor.okoro@student.rillcod.com', 'YWRtaW4xMjM=', 'Victor Okoro', 'student', true, 'victor.parent@email.com', '+234-830-123-4567', 'Government Girls Secondary School', 'SS1'),
('wunmi.adebayo@student.rillcod.com', 'YWRtaW4xMjM=', 'Wunmi Adebayo', 'student', true, 'wunmi.parent@email.com', '+234-831-234-5678', 'St. Mary''s High School', 'SS3'),
('yusuf.ibrahim@student.rillcod.com', 'YWRtaW4xMjM=', 'Yusuf Ibrahim', 'student', false, 'yusuf.parent@email.com', '+234-832-345-6789', 'Federal Government College', 'SS2'),
('zainab.ahmed@student.rillcod.com', 'YWRtaW4xMjM=', 'Zainab Ahmed', 'student', true, 'zainab.parent@email.com', '+234-833-456-7890', 'Loyola Jesuit College', 'SS1'),
('aisha.bello@student.rillcod.com', 'YWRtaW4xMjM=', 'Aisha Bello', 'student', true, 'aisha.parent@email.com', '+234-834-567-8901', 'King''s College', 'SS3'),
('blessing.okafor@student.rillcod.com', 'YWRtaW4xMjM=', 'Blessing Okafor', 'student', false, 'blessing.parent@email.com', '+234-835-678-9012', 'Queen''s College', 'SS2')
ON CONFLICT (email) DO NOTHING;

-- ========================================
-- STEP 5: DROP REDUNDANT STUDENTS TABLE
-- ========================================

-- Drop the students table since we're using portal_users
DROP TABLE IF EXISTS students;

-- ========================================
-- STEP 6: UPDATE ADMIN DASHBOARD QUERIES
-- ========================================

-- Verify the new structure
SELECT 
    role,
    COUNT(*) as count,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
FROM portal_users 
GROUP BY role 
ORDER BY role;

-- Check student-specific data
SELECT 
    full_name,
    email,
    parent_email,
    school_name,
    grade_level,
    is_active
FROM portal_users 
WHERE role = 'student'
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- STEP 7: SUCCESS MESSAGE
-- ========================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DATABASE RESTRUCTURED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ Students now in portal_users table';
    RAISE NOTICE '✓ Removed redundant students table';
    RAISE NOTICE '✓ All user types in one table';
    RAISE NOTICE '✓ Better data consistency';
    RAISE NOTICE '========================================';
END $$; 