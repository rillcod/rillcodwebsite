-- ============================================================
-- Seed: Parent Portal Demo Data
-- Usage: Run in Supabase SQL editor (or psql) AFTER migrations
-- Creates: 1 parent, 2 students linked to parent, progress
--   reports, attendance, certificates, invoices, payments,
--   notifications, and a payment account.
--
-- NOTE: These portal_users rows are DB-only (no Supabase Auth
--   account). To allow login you must separately create auth
--   users via Supabase Auth Admin API with the same emails.
-- ============================================================

-- ── Fixed UUIDs (easy to reference / delete later) ──────────
DO $$ BEGIN

-- Parent portal_user
INSERT INTO public.portal_users (id, email, full_name, role, phone, is_active, created_at, updated_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'parent.demo@rillcod.test',
  'Mrs. Funmilayo Okonkwo',
  'parent',
  '+2348056781234',
  true,
  NOW() - INTERVAL '30 days',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  full_name  = EXCLUDED.full_name,
  phone      = EXCLUDED.phone,
  updated_at = NOW();

-- ── Two demo students (pre-portal application students) ─────

INSERT INTO public.students (
  id, name, full_name, parent_email, parent_name, parent_phone, parent_relationship,
  school_name, grade_level, status, enrollment_type, date_of_birth, gender, created_at
) VALUES (
  'bbbbbbbb-0001-0000-0000-000000000001',
  'Chukwuemeka Okonkwo',
  'Chukwuemeka Okonkwo',
  'parent.demo@rillcod.test',
  'Mrs. Funmilayo Okonkwo',
  '+2348056781234',
  'Mother',
  'Benin City Secondary School',
  'JSS 3',
  'approved',
  'school',
  '2012-04-15',
  'Male',
  NOW() - INTERVAL '60 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.students (
  id, name, full_name, parent_email, parent_name, parent_phone, parent_relationship,
  school_name, grade_level, status, enrollment_type, date_of_birth, gender, created_at
) VALUES (
  'bbbbbbbb-0002-0000-0000-000000000001',
  'Adaobi Okonkwo',
  'Adaobi Okonkwo',
  'parent.demo@rillcod.test',
  'Mrs. Funmilayo Okonkwo',
  '+2348056781234',
  'Mother',
  'Benin City Secondary School',
  'JSS 1',
  'approved',
  'school',
  '2014-09-22',
  'Female',
  NOW() - INTERVAL '45 days'
) ON CONFLICT (id) DO NOTHING;

-- ── Portal users for the children (so invoices/grades work) ─

INSERT INTO public.portal_users (id, email, full_name, role, phone, is_active, created_at, updated_at)
VALUES (
  'cccccccc-0001-0000-0000-000000000001',
  'chukwuemeka.demo@rillcod.test',
  'Chukwuemeka Okonkwo',
  'student',
  NULL,
  true,
  NOW() - INTERVAL '55 days',
  NOW()
) ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

INSERT INTO public.portal_users (id, email, full_name, role, phone, is_active, created_at, updated_at)
VALUES (
  'cccccccc-0002-0000-0000-000000000001',
  'adaobi.demo@rillcod.test',
  'Adaobi Okonkwo',
  'student',
  NULL,
  true,
  NOW() - INTERVAL '40 days',
  NOW()
) ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Link portal users back to student records
UPDATE public.students SET user_id = 'cccccccc-0001-0000-0000-000000000001' WHERE id = 'bbbbbbbb-0001-0000-0000-000000000001';
UPDATE public.students SET user_id = 'cccccccc-0002-0000-0000-000000000001' WHERE id = 'bbbbbbbb-0002-0000-0000-000000000001';

-- ── Progress Reports ─────────────────────────────────────────

INSERT INTO public.student_progress_reports (
  id, student_id, student_name, school_name, course_name, report_term,
  theory_score, practical_score, attendance_score, participation_score,
  overall_score, overall_grade, is_published, report_date,
  instructor_name, learning_milestones, key_strengths, areas_for_growth
) VALUES (
  'dddddddd-0001-0000-0000-000000000001',
  'bbbbbbbb-0001-0000-0000-000000000001',
  'Chukwuemeka Okonkwo',
  'Benin City Secondary School',
  'Python Programming',
  '2025/2026 First Term',
  78, 82, 90, 85,
  82, 'B+',
  true,
  '2026-01-15',
  'Mr. Tunde Adeyemi',
  ARRAY[
    'Completed Python basics: variables, loops, functions',
    'Built a simple calculator app',
    'Learned file handling and basic data structures',
    'Participated in inter-house coding challenge'
  ],
  'Excellent problem-solving skills and strong grasp of loops. Very enthusiastic during group projects.',
  'Needs to practice debugging and reading error messages independently.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_progress_reports (
  id, student_id, student_name, school_name, course_name, report_term,
  theory_score, practical_score, attendance_score, participation_score,
  overall_score, overall_grade, is_published, report_date,
  instructor_name, learning_milestones, key_strengths, areas_for_growth
) VALUES (
  'dddddddd-0002-0000-0000-000000000001',
  'bbbbbbbb-0001-0000-0000-000000000001',
  'Chukwuemeka Okonkwo',
  'Benin City Secondary School',
  'Scratch & Robotics',
  '2024/2025 Third Term',
  85, 88, 95, 90,
  89, 'A-',
  true,
  '2025-09-10',
  'Mrs. Grace Eze',
  ARRAY[
    'Mastered Scratch animation and game design',
    'Built a line-following robot',
    'Learned basic electronics and sensors'
  ],
  'Outstanding hands-on skills. Consistently top performer in robotics lab.',
  'Presentation skills could be developed further; tends to be shy during class demos.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_progress_reports (
  id, student_id, student_name, school_name, course_name, report_term,
  theory_score, practical_score, attendance_score, participation_score,
  overall_score, overall_grade, is_published, report_date,
  instructor_name, learning_milestones, key_strengths, areas_for_growth
) VALUES (
  'dddddddd-0003-0000-0000-000000000001',
  'bbbbbbbb-0002-0000-0000-000000000001',
  'Adaobi Okonkwo',
  'Benin City Secondary School',
  'Introduction to Coding',
  '2025/2026 First Term',
  72, 75, 88, 80,
  78, 'B',
  true,
  '2026-01-15',
  'Mr. Tunde Adeyemi',
  ARRAY[
    'Learned basic Scratch animations',
    'Created first interactive story',
    'Understanding of loops and conditionals'
  ],
  'Creative thinker with great ideas for projects. Responds well to encouragement.',
  'Needs to build confidence in completing projects independently without prompting.'
) ON CONFLICT (id) DO NOTHING;

-- ── Class Sessions (for attendance) ─────────────────────────

INSERT INTO public.class_sessions (id, session_date, topic, is_active, created_at)
VALUES
  ('eeeeeeee-0001-0000-0000-000000000001', CURRENT_DATE - 2,  'Python Variables & Data Types', true, NOW()),
  ('eeeeeeee-0002-0000-0000-000000000001', CURRENT_DATE - 5,  'Loops & Conditionals',           true, NOW()),
  ('eeeeeeee-0003-0000-0000-000000000001', CURRENT_DATE - 9,  'Functions & Scope',              true, NOW()),
  ('eeeeeeee-0004-0000-0000-000000000001', CURRENT_DATE - 12, 'File Handling',                  true, NOW()),
  ('eeeeeeee-0005-0000-0000-000000000001', CURRENT_DATE - 16, 'Introduction to Scratch',        true, NOW()),
  ('eeeeeeee-0006-0000-0000-000000000001', CURRENT_DATE - 19, 'Scratch Animations',             true, NOW())
ON CONFLICT (id) DO NOTHING;

-- ── Attendance records — Chukwuemeka ────────────────────────

INSERT INTO public.attendance (id, student_id, session_id, status, created_at)
VALUES
  ('ffffffff-0001-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'eeeeeeee-0001-0000-0000-000000000001', 'present', NOW() - INTERVAL '2 days'),
  ('ffffffff-0002-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'eeeeeeee-0002-0000-0000-000000000001', 'present', NOW() - INTERVAL '5 days'),
  ('ffffffff-0003-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'eeeeeeee-0003-0000-0000-000000000001', 'late',    NOW() - INTERVAL '9 days'),
  ('ffffffff-0004-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'eeeeeeee-0004-0000-0000-000000000001', 'present', NOW() - INTERVAL '12 days'),
  ('ffffffff-0005-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'eeeeeeee-0005-0000-0000-000000000001', 'absent',  NOW() - INTERVAL '16 days'),
  ('ffffffff-0006-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'eeeeeeee-0006-0000-0000-000000000001', 'present', NOW() - INTERVAL '19 days')
ON CONFLICT (id) DO NOTHING;

-- ── Attendance records — Adaobi ─────────────────────────────

INSERT INTO public.attendance (id, student_id, session_id, status, created_at)
VALUES
  ('ffffffff-0007-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'eeeeeeee-0005-0000-0000-000000000001', 'present', NOW() - INTERVAL '16 days'),
  ('ffffffff-0008-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'eeeeeeee-0006-0000-0000-000000000001', 'present', NOW() - INTERVAL '19 days')
ON CONFLICT (id) DO NOTHING;

-- ── Certificate — Chukwuemeka ────────────────────────────────

INSERT INTO public.certificates (
  id, portal_user_id, certificate_number, verification_code, issued_date, metadata
) VALUES (
  'gggggggg-0001-0000-0000-000000000001',
  'cccccccc-0001-0000-0000-000000000001',
  'CERT-SCR-2025-0042',
  'VRF-A1B2C3',
  '2025-09-12',
  '{"course_name": "Scratch & Robotics", "grade": "A-", "term": "2024/2025 Third Term"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ── Payment account (bank transfer option) ───────────────────

INSERT INTO public.payment_accounts (
  id, label, bank_name, account_number, account_name, account_type,
  is_active, owner_type, payment_note, created_at
) VALUES (
  'hhhhhhhh-0001-0000-0000-000000000001',
  'Rillcod Technologies',
  'First Bank of Nigeria',
  '3087654321',
  'RILLCOD TECHNOLOGIES LTD',
  'Current',
  true,
  'global',
  'Use your child''s full name and student number as payment reference.',
  NOW()
) ON CONFLICT (id) DO UPDATE SET is_active = true;

-- ── Invoices — Chukwuemeka ───────────────────────────────────

INSERT INTO public.invoices (
  id, invoice_number, portal_user_id, amount, currency, status, due_date, items, notes, created_at
) VALUES (
  'iiiiiiii-0001-0000-0000-000000000001',
  'INV-2026-0041',
  'cccccccc-0001-0000-0000-000000000001',
  75000,
  'NGN',
  'paid',
  (NOW() - INTERVAL '20 days')::date,
  '[{"description": "Second Term Tuition Fee", "amount": 65000, "qty": 1}, {"description": "Study Materials", "amount": 10000, "qty": 1}]'::jsonb,
  'Second Term 2025/2026',
  NOW() - INTERVAL '60 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoices (
  id, invoice_number, portal_user_id, amount, currency, status, due_date, items, notes, created_at
) VALUES (
  'iiiiiiii-0002-0000-0000-000000000001',
  'INV-2026-0078',
  'cccccccc-0001-0000-0000-000000000001',
  75000,
  'NGN',
  'pending',
  (NOW() + INTERVAL '14 days')::date,
  '[{"description": "Third Term Tuition Fee", "amount": 65000, "qty": 1}, {"description": "Study Materials", "amount": 10000, "qty": 1}]'::jsonb,
  'Third Term 2025/2026',
  NOW() - INTERVAL '5 days'
) ON CONFLICT (id) DO NOTHING;

-- ── Invoice — Adaobi ─────────────────────────────────────────

INSERT INTO public.invoices (
  id, invoice_number, portal_user_id, amount, currency, status, due_date, items, notes, created_at
) VALUES (
  'iiiiiiii-0003-0000-0000-000000000001',
  'INV-2026-0079',
  'cccccccc-0002-0000-0000-000000000001',
  65000,
  'NGN',
  'overdue',
  (NOW() - INTERVAL '7 days')::date,
  '[{"description": "Third Term Tuition Fee", "amount": 60000, "qty": 1}, {"description": "Activity Fee", "amount": 5000, "qty": 1}]'::jsonb,
  'Third Term 2025/2026',
  NOW() - INTERVAL '35 days'
) ON CONFLICT (id) DO NOTHING;

-- ── Payment transaction (for the paid invoice) ───────────────

INSERT INTO public.payment_transactions (
  id, portal_user_id, amount, currency, payment_method, payment_status,
  transaction_reference, invoice_id, paid_at, created_at
) VALUES (
  'jjjjjjjj-0001-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001', -- parent paid
  75000,
  'NGN',
  'bank_transfer',
  'completed',
  'PAR-INV-2026-0041-1743000001',
  'iiiiiiii-0001-0000-0000-000000000001',
  NOW() - INTERVAL '18 days',
  NOW() - INTERVAL '18 days'
) ON CONFLICT (id) DO NOTHING;

-- ── Notifications for parent ─────────────────────────────────

INSERT INTO public.notifications (id, user_id, title, message, type, is_read, created_at)
VALUES
  (
    'kkkkkkkk-0001-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Payment Confirmed & Receipt Issued',
    'Invoice #INV-2026-0041 has been paid. Your receipt has been automatically generated and is available in your portal.',
    'payment',
    true,
    NOW() - INTERVAL '18 days'
  ),
  (
    'kkkkkkkk-0002-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'New Invoice Available',
    'Invoice #INV-2026-0078 for ₦75,000 has been issued for Chukwuemeka Okonkwo. Due: ' || to_char(NOW() + INTERVAL '14 days', 'DD Mon YYYY') || '.',
    'invoice',
    false,
    NOW() - INTERVAL '5 days'
  ),
  (
    'kkkkkkkk-0003-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Overdue Invoice',
    'Invoice #INV-2026-0079 for Adaobi Okonkwo is now overdue. Please pay as soon as possible to avoid disruption.',
    'invoice',
    false,
    NOW() - INTERVAL '1 day'
  ),
  (
    'kkkkkkkk-0004-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Report Card Published',
    'Chukwuemeka''s progress report for Python Programming (First Term 2025/2026) has been published. View it in your portal.',
    'report',
    false,
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO NOTHING;

END $$;

-- ── Summary ──────────────────────────────────────────────────
SELECT 'Seed complete' AS status,
  (SELECT COUNT(*) FROM public.portal_users WHERE email LIKE '%rillcod.test') AS portal_users_seeded,
  (SELECT COUNT(*) FROM public.students WHERE parent_email = 'parent.demo@rillcod.test') AS students_seeded,
  (SELECT COUNT(*) FROM public.student_progress_reports WHERE student_name IN ('Chukwuemeka Okonkwo','Adaobi Okonkwo')) AS reports_seeded,
  (SELECT COUNT(*) FROM public.attendance WHERE student_id IN ('bbbbbbbb-0001-0000-0000-000000000001','bbbbbbbb-0002-0000-0000-000000000001')) AS attendance_seeded,
  (SELECT COUNT(*) FROM public.invoices WHERE invoice_number LIKE 'INV-2026-00%') AS invoices_seeded,
  (SELECT COUNT(*) FROM public.notifications WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001') AS notifications_seeded;
