-- Rillcod Academy Sample Data
-- This script populates the database with initial sample data
-- It includes checks to prevent duplicate data insertion

BEGIN;

-- =============================
-- SAMPLE SCHOOLS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schools LIMIT 1) THEN
        INSERT INTO schools (id, name, address, city, state, contact_person, phone, email, student_count, school_type, lga, program_interest) VALUES
        ('550e8400-e29b-41d4-a716-446655440001', 'Lagos State Model College', '123 Victoria Island', 'Lagos', 'Lagos', 'Dr. Adebayo Johnson', '+2348012345678', 'info@lagosmodel.edu.ng', 1200, 'Public', 'Victoria Island', ARRAY['Web Development', 'Python Programming']),
        ('550e8400-e29b-41d4-a716-446655440002', 'Federal Government College', '456 Ikeja GRA', 'Lagos', 'Lagos', 'Mrs. Sarah Williams', '+2348012345680', 'info@fgcikeja.edu.ng', 800, 'Public', 'Ikeja', ARRAY['Mobile App Development', 'Data Science']);
    END IF;
END $$;

-- =============================
-- SAMPLE STUDENTS (LEGACY TABLE)
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM students LIMIT 1) THEN
        INSERT INTO students (id, name, age, email, phone, school, grade, gender, parent_name, course_interest, preferred_schedule, hear_about_us, status) VALUES
        ('770e8400-e29b-41d4-a716-446655440001', 'Grace Taylor', 15, 'student1@school.com', '+2348012346001', 'Lagos State Model College', 'SS2', 'female', 'Mr. Taylor', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440002', 'Henry Anderson', 16, 'student2@school.com', '+2348012346002', 'Federal Government College', 'SS3', 'male', 'Mrs. Anderson', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440003', 'Isabella Martinez', 15, 'student3@school.com', '+2348012346003', 'Lagos State Model College', 'SS2', 'female', 'Mr. Martinez', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440004', 'James Thomas', 16, 'student4@school.com', '+2348012346004', 'Federal Government College', 'SS3', 'male', 'Mrs. Thomas', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440005', 'Kelly White', 15, 'student5@school.com', '+2348012346005', 'Lagos State Model College', 'SS2', 'female', 'Mr. White', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440006', 'Liam Garcia', 16, 'student6@school.com', '+2348012346006', 'Federal Government College', 'SS3', 'male', 'Mrs. Garcia', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440007', 'Mia Rodriguez', 15, 'student7@school.com', '+2348012346007', 'Lagos State Model College', 'SS2', 'female', 'Mr. Rodriguez', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440008', 'Noah Lee', 16, 'student8@school.com', '+2348012346008', 'Federal Government College', 'SS3', 'male', 'Mrs. Lee', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440009', 'Olivia Clark', 15, 'student9@school.com', '+2348012346009', 'Lagos State Model College', 'SS2', 'female', 'Mr. Clark', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440010', 'Peter Harris', 16, 'student10@school.com', '+2348012346010', 'Federal Government College', 'SS3', 'male', 'Mrs. Harris', 'Python Programming', 'After School', 'Friend Recommendation', 'approved');
    END IF;
END $$;

-- Update student_id in portal_users
DO $$ 
BEGIN
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440001'
    WHERE email = 'student1@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440002'
    WHERE email = 'student2@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440003'
    WHERE email = 'student3@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440004'
    WHERE email = 'student4@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440005'
    WHERE email = 'student5@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440006'
    WHERE email = 'student6@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440007'
    WHERE email = 'student7@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440008'
    WHERE email = 'student8@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440009'
    WHERE email = 'student9@school.com';
    
    UPDATE portal_users 
    SET student_id = '770e8400-e29b-41d4-a716-446655440010'
    WHERE email = 'student10@school.com';
END $$;

-- =============================
-- SAMPLE PROGRAMS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM programs LIMIT 1) THEN
        INSERT INTO programs (id, name, description, duration_weeks, difficulty_level, price, max_students, is_active) VALUES
        ('880e8400-e29b-41d4-a716-446655440001', 'Web Development Fundamentals', 'Learn the basics of web development with HTML, CSS, and JavaScript', 12, 'beginner', 50000.00, 30, true),
        ('880e8400-e29b-41d4-a716-446655440002', 'Python Programming', 'Master Python programming from basics to advanced concepts', 16, 'intermediate', 75000.00, 25, true),
        ('880e8400-e29b-41d4-a716-446655440003', 'Mobile App Development', 'Build native mobile applications using React Native', 14, 'intermediate', 65000.00, 20, true),
        ('880e8400-e29b-41d4-a716-446655440004', 'Data Science', 'Learn data analysis, visualization, and machine learning', 20, 'advanced', 100000.00, 15, true);
    END IF;
END $$;

-- =============================
-- SAMPLE COURSES
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM courses LIMIT 1) THEN
        INSERT INTO courses (id, program_id, title, description, content, duration_hours, order_index, is_active) VALUES
        ('990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'HTML Basics', 'Introduction to HTML markup language', 'Learn HTML structure, elements, and semantic markup', 8, 1, true),
        ('990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'CSS Styling', 'Cascading Style Sheets fundamentals', 'Master CSS selectors, properties, and layouts', 10, 2, true),
        ('990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'JavaScript Fundamentals', 'Introduction to JavaScript programming', 'Learn variables, functions, and DOM manipulation', 12, 3, true),
        ('990e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'Python Basics', 'Introduction to Python programming', 'Learn Python syntax, data types, and control structures', 10, 1, true),
        ('990e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'Python OOP', 'Object-Oriented Programming in Python', 'Master classes, objects, and inheritance', 12, 2, true);
    END IF;
END $$;

-- =============================
-- SAMPLE ENROLLMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM enrollments LIMIT 1) THEN
        INSERT INTO enrollments (id, user_id, program_id, role, enrollment_date, status) VALUES
        ('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440300', '880e8400-e29b-41d4-a716-446655440001', 'student', '2024-01-15', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301', '880e8400-e29b-41d4-a716-446655440002', 'student', '2024-01-20', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302', '880e8400-e29b-41d4-a716-446655440003', 'student', '2024-01-25', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440303', '880e8400-e29b-41d4-a716-446655440004', 'student', '2024-02-01', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440304', '880e8400-e29b-41d4-a716-446655440001', 'student', '2024-02-05', 'active');
    END IF;
END $$;

-- =============================
-- SAMPLE ASSIGNMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM assignments LIMIT 1) THEN
        INSERT INTO assignments (id, course_id, title, description, instructions, due_date, max_points, assignment_type, is_active) VALUES
        ('bb0e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', 'HTML Portfolio', 'Create a personal portfolio using HTML', 'Build a 3-page portfolio with proper HTML structure', '2024-02-15 23:59:00', 100, 'project', true),
        ('bb0e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440002', 'CSS Layout Challenge', 'Design responsive layouts with CSS', 'Create responsive layouts using Flexbox and Grid', '2024-02-20 23:59:00', 100, 'homework', true),
        ('bb0e8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440003', 'JavaScript Calculator', 'Build a calculator using JavaScript', 'Implement basic arithmetic operations with a user interface', '2024-02-25 23:59:00', 100, 'project', true),
        ('bb0e8400-e29b-41d4-a716-446655440004', '990e8400-e29b-41d4-a716-446655440004', 'Python Quiz Game', 'Create a quiz game in Python', 'Build a command-line quiz game with score tracking', '2024-03-01 23:59:00', 100, 'project', true),
        ('bb0e8400-e29b-41d4-a716-446655440005', '990e8400-e29b-41d4-a716-446655440005', 'OOP Project', 'Design a class hierarchy', 'Create a class hierarchy for a library management system', '2024-03-05 23:59:00', 100, 'homework', true);
    END IF;
END $$;

-- =============================
-- SAMPLE ANNOUNCEMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM announcements LIMIT 1) THEN
        INSERT INTO announcements (id, title, content, author_id, target_audience, is_active) VALUES
        ('cc0e8400-e29b-41d4-a716-446655440001', 'Welcome to Rillcod Academy!', 'Welcome all students to the new academic session. We are excited to have you join our programming community.', '550e8400-e29b-41d4-a716-446655440101', 'all', true),
        ('cc0e8400-e29b-41d4-a716-446655440002', 'New Course Available', 'We are pleased to announce our new Data Science course starting next month.', '550e8400-e29b-41d4-a716-446655440101', 'students', true),
        ('cc0e8400-e29b-41d4-a716-446655440003', 'Holiday Schedule', 'The academy will be closed for the upcoming holiday. Classes will resume on Monday.', '550e8400-e29b-41d4-a716-446655440101', 'all', true),
        ('cc0e8400-e29b-41d4-a716-446655440004', 'Teacher Training', 'All teachers are required to attend the training session this Friday.', '550e8400-e29b-41d4-a716-446655440101', 'teachers', true),
        ('cc0e8400-e29b-41d4-a716-446655440005', 'Student Achievement', 'Congratulations to our students who completed their projects successfully!', '550e8400-e29b-41d4-a716-446655440101', 'all', true);
    END IF;
END $$;

-- =============================
-- SAMPLE SYSTEM SETTINGS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1) THEN
        INSERT INTO system_settings (id, setting_key, setting_value, description, category, is_public) VALUES
        ('dd0e8400-e29b-41d4-a716-446655440001', 'site_name', 'Rillcod Academy', 'Name of the academy', 'general', true),
        ('dd0e8400-e29b-41d4-a716-446655440002', 'site_description', 'Leading programming academy in Nigeria', 'Site description', 'general', true),
        ('dd0e8400-e29b-41d4-a716-446655440003', 'contact_email', 'contact@rillcod.com', 'Contact email address', 'contact', true),
        ('dd0e8400-e29b-41d4-a716-446655440004', 'contact_phone', '+2348012345678', 'Contact phone number', 'contact', true),
        ('dd0e8400-e29b-41d4-a716-446655440005', 'maintenance_mode', 'false', 'System maintenance mode', 'system', false);
    END IF;
END $$;

-- =============================
-- SAMPLE CBT EXAMS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cbt_exams LIMIT 1) THEN
        INSERT INTO cbt_exams (id, title, description, program_id, duration_minutes, total_questions, passing_score, is_active, start_date, end_date) VALUES
        ('ee0e8400-e29b-41d4-a716-446655440001', 'Web Development Midterm', 'Midterm examination for Web Development Fundamentals', '880e8400-e29b-41d4-a716-446655440001', 60, 20, 70, true, '2024-02-15 09:00:00', '2024-02-15 17:00:00'),
        ('ee0e8400-e29b-41d4-a716-446655440002', 'Python Final Exam', 'Final examination for Python Programming', '880e8400-e29b-41d4-a716-446655440002', 90, 30, 75, true, '2024-03-15 09:00:00', '2024-03-15 17:00:00'),
        ('ee0e8400-e29b-41d4-a716-446655440003', 'Mobile App Quiz', 'Quiz for Mobile App Development', '880e8400-e29b-41d4-a716-446655440003', 45, 15, 60, true, '2024-02-20 09:00:00', '2024-02-20 17:00:00');
    END IF;
END $$;

-- =============================
-- SAMPLE CBT QUESTIONS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cbt_questions LIMIT 1) THEN
        INSERT INTO cbt_questions (id, exam_id, question_text, question_type, options, correct_answer, points, order_index) VALUES
        ('ff0e8400-e29b-41d4-a716-446655440001', 'ee0e8400-e29b-41d4-a716-446655440001', 'What does HTML stand for?', 'multiple_choice', '["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlink and Text Markup Language"]', 'Hyper Text Markup Language', 5, 1),
        ('ff0e8400-e29b-41d4-a716-446655440002', 'ee0e8400-e29b-41d4-a716-446655440001', 'Which CSS property controls the text size?', 'multiple_choice', '["font-size", "text-size", "size", "font-style"]', 'font-size', 5, 2),
        ('ff0e8400-e29b-41d4-a716-446655440003', 'ee0e8400-e29b-41d4-a716-446655440002', 'What is the correct way to create a function in Python?', 'multiple_choice', '["def function_name():", "function function_name():", "create function_name():", "new function_name():"]', 'def function_name():', 5, 1),
        ('ff0e8400-e29b-41d4-a716-446655440004', 'ee0e8400-e29b-41d4-a716-446655440002', 'Which of the following is a Python data type?', 'multiple_choice', '["list", "array", "vector", "sequence"]', 'list', 5, 2),
        ('ff0e8400-e29b-41d4-a716-446655440005', 'ee0e8400-e29b-41d4-a716-446655440003', 'What is React Native?', 'multiple_choice', '["A framework for building mobile apps", "A database system", "A programming language", "A web server"]', 'A framework for building mobile apps', 5, 1);
    END IF;
END $$;

-- =============================
-- SAMPLE PAYMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM payments LIMIT 1) THEN
        INSERT INTO payments (id, user_id, program_id, amount, payment_method, payment_status, transaction_reference, payment_date, notes) VALUES
        ('110e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440300', '880e8400-e29b-41d4-a716-446655440001', 50000.00, 'bank_transfer', 'completed', 'TXN001', '2024-01-15 10:30:00', 'Payment for Web Development course'),
        ('110e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301', '880e8400-e29b-41d4-a716-446655440002', 75000.00, 'card', 'completed', 'TXN002', '2024-01-20 14:45:00', 'Payment for Python Programming course'),
        ('110e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302', '880e8400-e29b-41d4-a716-446655440003', 65000.00, 'bank_transfer', 'completed', 'TXN003', '2024-01-25 09:15:00', 'Payment for Mobile App Development course'),
        ('110e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440303', '880e8400-e29b-41d4-a716-446655440004', 100000.00, 'card', 'completed', 'TXN004', '2024-02-01 16:20:00', 'Payment for Data Science course'),
        ('110e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440304', '880e8400-e29b-41d4-a716-446655440001', 50000.00, 'bank_transfer', 'completed', 'TXN005', '2024-02-05 11:30:00', 'Payment for Web Development course');
    END IF;
END $$;

-- =============================
-- SAMPLE NOTIFICATIONS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM notifications LIMIT 1) THEN
        INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES
        ('120e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440300', 'Welcome!', 'Welcome to Rillcod Academy. Your account has been activated.', 'success', false),
        ('120e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301', 'Course Enrollment', 'You have been successfully enrolled in Python Programming course.', 'info', false),
        ('120e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302', 'Payment Confirmed', 'Your payment for Mobile App Development course has been confirmed.', 'success', false),
        ('120e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440303', 'New Assignment', 'A new assignment has been posted for your course.', 'info', false),
        ('120e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440304', 'Course Reminder', 'Your Web Development course starts tomorrow.', 'warning', false);
    END IF;
END $$;

COMMIT; 