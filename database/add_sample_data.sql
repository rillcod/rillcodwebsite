-- Add Sample Data for Rillcod Academy
-- This will populate your tables with realistic data

-- ========================================
-- ADD SAMPLE SCHOOLS
-- ========================================

INSERT INTO schools (name, city, state, address, phone, email, is_active) VALUES
('St. Mary''s High School', 'Lagos', 'Lagos State', '123 Victoria Island, Lagos', '+234-801-234-5678', 'info@stmarys.edu.ng', true),
('Federal Government College', 'Abuja', 'FCT', '456 Wuse Zone 2, Abuja', '+234-802-345-6789', 'admin@fgcabuja.edu.ng', true),
('Loyola Jesuit College', 'Abuja', 'FCT', '789 Gidan Mangoro, Abuja', '+234-803-456-7890', 'contact@loyolajesuit.org', true),
('King''s College', 'Lagos', 'Lagos State', '321 Tafawa Balewa Square, Lagos', '+234-804-567-8901', 'principal@kingscollege.edu.ng', true),
('Queen''s College', 'Lagos', 'Lagos State', '654 Yaba, Lagos', '+234-805-678-9012', 'info@queenscollege.edu.ng', true),
('Government Secondary School', 'Port Harcourt', 'Rivers State', '987 Old GRA, Port Harcourt', '+234-806-789-0123', 'gssph@rivers.gov.ng', true),
('St. Gregory''s College', 'Lagos', 'Lagos State', '147 Ikoyi, Lagos', '+234-807-890-1234', 'admin@stgregorys.edu.ng', true),
('Federal Science and Technical College', 'Kano', 'Kano State', '258 Nasarawa GRA, Kano', '+234-808-901-2345', 'fstckano@kano.gov.ng', true),
('St. Francis Catholic Secondary School', 'Enugu', 'Enugu State', '369 New Haven, Enugu', '+234-809-012-3456', 'stfrancis@enugu.edu.ng', true),
('Government Girls Secondary School', 'Kaduna', 'Kaduna State', '741 Barnawa, Kaduna', '+234-810-123-4567', 'ggsskaduna@kaduna.gov.ng', true);

-- ========================================
-- ADD SAMPLE STUDENTS
-- ========================================

INSERT INTO students (full_name, parent_email, parent_phone, school_name, grade_level, status) VALUES
('Adebayo Oluwaseun', 'adebayo.parent@email.com', '+234-811-234-5678', 'St. Mary''s High School', 'SS2', 'approved'),
('Chioma Nwosu', 'chioma.parent@email.com', '+234-812-345-6789', 'Federal Government College', 'SS1', 'approved'),
('Emeka Okonkwo', 'emeka.parent@email.com', '+234-813-456-7890', 'Loyola Jesuit College', 'SS3', 'pending'),
('Fatima Ahmed', 'fatima.parent@email.com', '+234-814-567-8901', 'King''s College', 'SS2', 'approved'),
('Gabriel Okafor', 'gabriel.parent@email.com', '+234-815-678-9012', 'Queen''s College', 'SS1', 'approved'),
('Hassan Ibrahim', 'hassan.parent@email.com', '+234-816-789-0123', 'Government Secondary School', 'SS3', 'pending'),
('Ijeoma Eze', 'ijeoma.parent@email.com', '+234-817-890-1234', 'St. Gregory''s College', 'SS2', 'approved'),
('John Doe', 'john.parent@email.com', '+234-818-901-2345', 'Federal Science and Technical College', 'SS1', 'rejected'),
('Kemi Adebayo', 'kemi.parent@email.com', '+234-819-012-3456', 'St. Francis Catholic Secondary School', 'SS3', 'approved'),
('Lola Ogunlesi', 'lola.parent@email.com', '+234-820-123-4567', 'Government Girls Secondary School', 'SS2', 'pending'),
('Mohammed Bello', 'mohammed.parent@email.com', '+234-821-234-5678', 'St. Mary''s High School', 'SS1', 'approved'),
('Ngozi Okonkwo', 'ngozi.parent@email.com', '+234-822-345-6789', 'Federal Government College', 'SS3', 'approved'),
('Oluwaseun Adeyemi', 'oluwaseun.parent@email.com', '+234-823-456-7890', 'Loyola Jesuit College', 'SS2', 'pending'),
('Patience Uche', 'patience.parent@email.com', '+234-824-567-8901', 'King''s College', 'SS1', 'approved'),
('Quadri Olalekan', 'quadri.parent@email.com', '+234-825-678-9012', 'Queen''s College', 'SS3', 'approved'),
('Rachael Okafor', 'rachael.parent@email.com', '+234-826-789-0123', 'Government Secondary School', 'SS2', 'pending'),
('Samuel Adebayo', 'samuel.parent@email.com', '+234-827-890-1234', 'St. Gregory''s College', 'SS1', 'approved'),
('Temitope Johnson', 'temitope.parent@email.com', '+234-828-901-2345', 'Federal Science and Technical College', 'SS3', 'approved'),
('Uchechi Nwosu', 'uchechi.parent@email.com', '+234-829-012-3456', 'St. Francis Catholic Secondary School', 'SS2', 'pending'),
('Victor Okoro', 'victor.parent@email.com', '+234-830-123-4567', 'Government Girls Secondary School', 'SS1', 'approved'),
('Wunmi Adebayo', 'wunmi.parent@email.com', '+234-831-234-5678', 'St. Mary''s High School', 'SS3', 'approved'),
('Yusuf Ibrahim', 'yusuf.parent@email.com', '+234-832-345-6789', 'Federal Government College', 'SS2', 'pending'),
('Zainab Ahmed', 'zainab.parent@email.com', '+234-833-456-7890', 'Loyola Jesuit College', 'SS1', 'approved'),
('Aisha Bello', 'aisha.parent@email.com', '+234-834-567-8901', 'King''s College', 'SS3', 'approved'),
('Blessing Okafor', 'blessing.parent@email.com', '+234-835-678-9012', 'Queen''s College', 'SS2', 'pending');

-- ========================================
-- ADD MORE TEACHERS TO PORTAL_USERS
-- ========================================

INSERT INTO portal_users (email, password_hash, full_name, role, is_active) VALUES
('teacher1@rillcod.com', 'YWRtaW4xMjM=', 'Mrs. Sarah Johnson', 'teacher', true),
('teacher2@rillcod.com', 'YWRtaW4xMjM=', 'Mr. David Okonkwo', 'teacher', true),
('teacher3@rillcod.com', 'YWRtaW4xMjM=', 'Mrs. Grace Adebayo', 'teacher', false),
('teacher4@rillcod.com', 'YWRtaW4xMjM=', 'Mr. Michael Ibrahim', 'teacher', true),
('teacher5@rillcod.com', 'YWRtaW4xMjM=', 'Mrs. Elizabeth Okafor', 'teacher', false),
('student1@rillcod.com', 'YWRtaW4xMjM=', 'John Student', 'student', true),
('student2@rillcod.com', 'YWRtaW4xMjM=', 'Mary Student', 'student', true);

-- ========================================
-- VERIFY DATA
-- ========================================

-- Check counts
SELECT 'Schools' as table_name, COUNT(*) as count FROM schools
UNION ALL
SELECT 'Students' as table_name, COUNT(*) as count FROM students
UNION ALL
SELECT 'Portal Users' as table_name, COUNT(*) as count FROM portal_users;

-- Check student status distribution
SELECT status, COUNT(*) as count 
FROM students 
GROUP BY status 
ORDER BY status;

-- Check schools by state
SELECT state, COUNT(*) as count 
FROM schools 
GROUP BY state 
ORDER BY count DESC;

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SAMPLE DATA ADDED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Added 10 schools across Nigeria';
    RAISE NOTICE 'Added 25 students with various statuses';
    RAISE NOTICE 'Added 7 additional portal users (teachers/students)';
    RAISE NOTICE 'Your admin dashboard should now show data!';
    RAISE NOTICE '========================================';
END $$; 