SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict 6KJZOrp6UuzmUqL2qpF1WaXNVETw3shnezVMbvHbE1x4GR9VMQWc3zVa9QjnOGh

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: schools; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."schools" ("id", "name", "address", "city", "state", "contact_person", "phone", "email", "student_count", "created_at", "school_type", "lga", "program_interest", "updated_at", "status", "is_active", "is_deleted", "enrollment_types") VALUES
	('86dbd10b-e2cd-428d-8ef9-e6cb6a537795', 'HILLTOP MONTESSORI SCHOOL', 'Irhi oko', 'Benin ', 'Edo', 'Mrs Sunday ', '+24488889⁹⁹', 'hilltop@rillcod.com', 200, '2026-03-09 20:43:02.471408+00', 'Primary ', 'Oredo', '{}', '2026-03-09 20:43:04.09172+00', 'approved', true, false, '{school}'),
	('5410c950-6af0-4186-9187-202e26fbab08', 'Partner School', 'z', 'Lagos', 'Lagos', 'Partner School Admin', '+23480770000', 'school@rillcodacademy.com', NULL, '2026-03-04 11:33:02.621512+00', 'partner', NULL, '{STEM,Programming}', '2026-03-04 11:33:02.621512+00', 'approved', true, false, '{school}'),
	('f869a869-9ad1-4bba-a481-3bbb28eeb867', 'new', NULL, NULL, NULL, 'chikea', NULL, 'bew@school.com', NULL, '2026-03-11 16:36:11.762299+00', NULL, NULL, '{}', '2026-03-11 16:36:14.33723+00', 'approved', true, false, '{school}'),
	('344f1eeb-b175-4740-bf5b-5747a36a5de6', 'KEY TO SUCCESS EDUCATION CENTRE', '20 ogiesoba aveune', 'benin city', 'edo', 'KSEC', NULL, 'ksec@rillcod.com', 80, '2026-03-11 19:13:27.175593+00', 'Primary/Secondary ', NULL, '{}', '2026-03-11 19:13:30.085935+00', 'approved', true, false, '{school}');


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."students" ("id", "name", "age", "email", "phone", "school", "created_at", "grade", "gender", "parent_name", "course_interest", "preferred_schedule", "hear_about_us", "status", "updated_at", "is_active", "is_deleted", "full_name", "date_of_birth", "parent_email", "parent_phone", "school_name", "current_class", "city", "state", "country", "medical_conditions", "allergies", "previous_programming_experience", "interests", "goals", "approved_by", "approved_at", "user_id", "student_number", "grade_level", "avatar_url", "enrollment_type", "student_email", "heard_about_us", "parent_relationship", "school_id", "section", "created_by") VALUES
	('295be003-5e58-4752-a688-c1d149de3714', 'Older', NULL, NULL, NULL, NULL, '2026-03-09 15:00:34.953+00', NULL, 'female', 'Ooooo', 'Robotics', 'Weekend Bootcamp', NULL, 'approved', '2026-03-09 15:01:54.335748+00', true, false, 'Older', '2026-03-03', 'pppa@emjej.com', '2355485588', NULL, NULL, NULL, 'Cross River', 'Nigeria', NULL, NULL, NULL, 'Robotics', 'Weekend Bootcamp', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:01:54.114+00', '914e5c26-2ad9-4962-a532-fbaa5e93b108', NULL, 'SSS 1-3', NULL, 'bootcamp', NULL, NULL, 'Sibling', NULL, NULL, NULL),
	('13ee6c84-ed17-401e-b2e0-132371d368ad', 'Precious Obiocha', NULL, NULL, NULL, NULL, '2026-03-09 15:56:19.506572+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-09 20:43:47.3399+00', true, false, 'Precious Obiocha', NULL, 'obiocha@rillcod.com', '+2348116600091', 'HILLTOP MONTESSORI SCHOOL', NULL, 'Benin city', 'Edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:56:41.284+00', 'f6ceefff-125f-4e02-9f63-75aa2dd8dc16', NULL, 'Primary 1', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('ab277956-dc13-42ed-84d4-e2f81c56d460', 'Caring Kester', NULL, NULL, NULL, NULL, '2026-03-09 15:55:21.872566+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-09 20:43:54.810334+00', true, false, 'Caring Kester', NULL, 'rillcodjjjj@gmail.com', '', 'HILLTOP MONTESSORI SCHOOL', NULL, 'benin city', 'edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:56:42.66+00', '1f4ba692-a50a-4ef5-870f-f50534c47e1f', NULL, '', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('f22f36c5-cde0-45e3-9239-25fc82be778b', 'Adriel Osemeahon', NULL, NULL, NULL, NULL, '2026-03-09 15:54:36.651676+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-09 20:44:02.94648+00', true, false, 'Adriel Osemeahon', NULL, 'rillcooood@gmail.com', '+2348116600091', 'HILLTOP MONTESSORI SCHOOL', NULL, 'Benin city', 'Edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:56:43.523+00', '5a87f1f3-5e99-4a9a-9588-458127c8fa6d', NULL, 'Primary 1', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('819ef12d-c25b-4e2e-ae32-5e5963a1ed4f', 'Diyva Obahaya', NULL, NULL, NULL, NULL, '2026-03-09 15:53:50.981876+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-09 20:44:11.831407+00', true, false, 'Diyva Obahaya', NULL, 'rillyyycod@gmail.com', '+2348116600091', 'HILLTOP MONTESSORI SCHOOL', NULL, 'Benin city', 'Edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:56:43.895+00', '2b78523e-1406-41e0-a876-5a05d9e0655c', NULL, '', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('5c3ff3c1-a5a8-4b40-9afa-12dfd2748975', 'Abdulwaris Oyarekhuan', NULL, NULL, NULL, NULL, '2026-03-09 15:51:30.780434+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-09 20:44:24.58901+00', true, false, 'Abdulwaris Oyarekhuan', NULL, 'rillcohhjhd@gmail.com', '+2348116600091', 'HILLTOP MONTESSORI SCHOOL', NULL, 'Benin city', 'Edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:56:50.362+00', '582dae2b-b7f9-4415-b4e4-313251aca433', NULL, 'Primary 1', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('a4d77654-eb57-4911-92b8-6d5d4bfbba32', 'Alvin Osemeahon', NULL, NULL, NULL, NULL, '2026-03-09 15:50:25.627141+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-09 20:44:35.935993+00', true, false, 'Alvin Osemeahon', NULL, 'ose@gmail.com', '+2348116600091', 'HILLTOP MONTESSORI SCHOOL', NULL, 'benin city', 'edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:56:49.047+00', 'b7b40602-c01e-4fdc-b363-f2cf3543ba70', NULL, 'Primary 3', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('a611ed38-c4c1-499b-b377-d2fe1bdb8fa2', 'JESSE GEORGE', NULL, NULL, NULL, NULL, '2026-03-09 15:32:31.578069+00', NULL, NULL, 'MR GEORGE', NULL, NULL, NULL, 'approved', '2026-03-09 20:44:48.839229+00', true, false, 'JESSE GEORGE', NULL, 'geo@rillcod.com', '2340000000', 'HILLTOP MONTESSORI SCHOOL', NULL, 'benin city', 'edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 15:32:45.503+00', '42b94ceb-577a-470e-81b2-b27156b2d516', NULL, 'Primary 1', NULL, 'school', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75'),
	('dd18a564-73aa-401b-a6c3-b4f7e24f151c', 'Osaretin Isreal Osaretin', NULL, NULL, NULL, NULL, '2026-03-11 19:48:14.093322+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:26.551492+00', true, false, 'Osaretin Isreal Osaretin', NULL, 'isrealo@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:26.27+00', '7d069901-7ed7-4a86-82bc-859c7608ac6d', NULL, 'JSS1', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('bd56ff7f-7439-4cde-88fb-71e64602e60a', 'Maryam Lawal  Salisu', NULL, NULL, NULL, NULL, '2026-03-11 19:45:44.601457+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:36.695402+00', true, false, 'Maryam Lawal  Salisu', NULL, 'maryam@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:36.609+00', '46e14d34-f182-4592-8453-5590fe828b8b', NULL, '', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('80eb9240-d830-464d-abd7-30502474a429', 'Bumhe Ile-Ojiede', NULL, NULL, NULL, NULL, '2026-03-11 19:44:14.571564+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:40.936892+00', true, false, 'Bumhe Ile-Ojiede', NULL, 'bumhe@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:40.847+00', '8978eba6-9060-49df-9fb7-669c43ead088', NULL, 'JSS1', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('220014c2-bf5f-40f0-859f-97ffc8d90cb4', 'Deborah Iorngee', NULL, NULL, NULL, NULL, '2026-03-11 19:47:08.614016+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:44.504785+00', true, false, 'Deborah Iorngee', NULL, 'debby@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:44.415+00', '137cf602-7159-4763-af4f-d11334bff70e', NULL, 'JSS3', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('811c81c1-0e10-49b2-b41e-f15435243d33', 'IYOBOSASERE ABUNDANCE', NULL, NULL, NULL, NULL, '2026-03-11 19:25:27.119642+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:48.437967+00', true, false, 'IYOBOSASERE ABUNDANCE', NULL, 'abundance@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:48.325+00', '7c8d4dc6-bc3f-40dd-8ef3-4952ee547d7d', NULL, 'JSS1', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('c719b9a9-458d-4472-a09e-7d32fd22305f', 'Femi farukanem Joseph ', NULL, NULL, NULL, NULL, '2026-03-11 19:26:52.038165+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:52.104958+00', true, false, 'Femi farukanem Joseph ', NULL, 'femi@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:52.023+00', '89b79e23-cab3-4cf7-920e-2794749e590e', NULL, 'JSS1', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('699d798b-3fe3-4450-83cb-5dc6139e3b8e', 'IYOBOSASERE HEPHZIBAH', NULL, NULL, NULL, NULL, '2026-03-11 19:22:12.583357+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:49:55.976606+00', true, false, 'IYOBOSASERE HEPHZIBAH', NULL, 'heph@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, 'benin city', 'edo', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:49:55.899+00', '24dd6097-bbf0-4297-aa5c-b068a315ed8c', NULL, 'JSS3', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('e5794e11-2d5a-49a1-9825-48a36338fd46', 'Isreal Morisson', NULL, NULL, NULL, NULL, '2026-03-11 19:23:50.607706+00', NULL, NULL, '', NULL, NULL, NULL, 'approved', '2026-03-11 19:50:00.340334+00', true, false, 'Isreal Morisson', NULL, 'isreal@rillcod.com', '', 'KEY TO SUCCESS EDUCATION CENTRE', NULL, '', '', 'Nigeria', NULL, NULL, NULL, NULL, NULL, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:50:00.249+00', '3bfba220-35fb-494f-a1d9-aff0c8ab769b', NULL, 'JSS1', NULL, 'school', NULL, NULL, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 'd2c26a88-307a-4034-9a1f-ac037e5cc103'),
	('3f661f97-f5d9-4e51-8199-12cae0979240', 'Imuetinyan', NULL, NULL, NULL, NULL, '2026-03-11 18:16:59.902+00', NULL, 'female', 'Airhienbuwa Osahon', 'AI & Data Science', 'Online Self-Paced', NULL, 'approved', '2026-03-11 19:50:03.709771+00', true, false, 'Imuetinyan', '2021-03-10', 'imuetinyanc@gmail.com', '9063847552', NULL, NULL, 'Benin city', 'Edo', 'Nigeria', NULL, NULL, NULL, 'AI & Data Science', 'Online Self-Paced', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:50:03.618+00', 'a62d1fc6-bbea-4e7a-bdee-5e5ee670b2b6', NULL, 'Adult Learner', NULL, 'online', NULL, 'Other', 'Guardian', NULL, NULL, NULL);


--
-- Data for Name: portal_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."portal_users" ("id", "email", "full_name", "role", "phone", "school_name", "is_active", "email_verified", "profile_image_url", "bio", "created_at", "updated_at", "student_id", "is_deleted", "last_login", "school_id", "enrollment_type", "reputation_score", "section_class", "current_module", "date_of_birth", "photo_url", "created_by") VALUES
	('d2c26a88-307a-4034-9a1f-ac037e5cc103', 'gra@rillcod.com', 'gra', 'teacher', NULL, NULL, true, false, NULL, NULL, '2026-03-11 19:15:29.348022+00', '2026-03-11 19:51:34.805468+00', NULL, false, '2026-03-11 19:51:36.505+00', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('137cf602-7159-4763-af4f-d11334bff70e', 'debby@rillcod.com', 'Deborah Iorngee', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:44.107736+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('24dd6097-bbf0-4297-aa5c-b068a315ed8c', 'heph@rillcod.com', 'IYOBOSASERE HEPHZIBAH', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:55.669037+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('914e5c26-2ad9-4962-a532-fbaa5e93b108', 'pppa@emjej.com', 'Older', 'student', NULL, NULL, true, false, NULL, NULL, '2026-03-09 15:01:53.542129+00', '2026-03-09 15:01:54.00838+00', NULL, false, NULL, NULL, NULL, 0, NULL, NULL, '2026-03-03', NULL, NULL),
	('3bfba220-35fb-494f-a1d9-aff0c8ab769b', 'isreal@rillcod.com', 'Isreal Morisson', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:50:00.015116+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('095f45b5-e26c-45b3-a4d5-5d2928888ce1', 'school@rillcodacademy.com', 'Partner School', 'school', NULL, NULL, true, false, NULL, NULL, '2026-03-04 10:33:31.097+00', '2026-03-09 15:16:42.1464+00', NULL, false, '2026-03-09 15:16:43.122+00', '5410c950-6af0-4186-9187-202e26fbab08', NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('f6ceefff-125f-4e02-9f63-75aa2dd8dc16', 'obiocha@rillcod.com', 'Precious Obiocha', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 20:32:26.079+00', '2026-03-10 19:29:53.198018+00', NULL, false, NULL, NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('1f4ba692-a50a-4ef5-870f-f50534c47e1f', 'rillcodjjjj@gmail.com', 'Caring Kester', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 20:32:26.622+00', '2026-03-10 19:29:53.492675+00', NULL, false, NULL, NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('5a87f1f3-5e99-4a9a-9588-458127c8fa6d', 'rillcooood@gmail.com', 'Adriel Osemeahon', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 20:36:36.573+00', '2026-03-10 19:29:53.784058+00', NULL, false, NULL, NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('2b78523e-1406-41e0-a876-5a05d9e0655c', 'rillyyycod@gmail.com', 'Diyva Obahaya', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 20:36:37.175+00', '2026-03-10 19:29:54.082182+00', NULL, false, NULL, NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('b7b40602-c01e-4fdc-b363-f2cf3543ba70', 'ose@gmail.com', 'Alvin Osemeahon', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 15:56:48.794121+00', '2026-03-10 19:29:54.665355+00', NULL, false, NULL, NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('42b94ceb-577a-470e-81b2-b27156b2d516', 'geo@rillcod.com', 'JESSE GEORGE', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 15:32:45.247613+00', '2026-03-10 19:29:54.957605+00', NULL, false, NULL, NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('a60378ee-37a4-4f28-8785-6fb558853de7', 'ksec@rillcod.com', 'KSEC', 'school', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:13:30.597831+00', '2026-03-11 19:13:30.801853+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('46e14d34-f182-4592-8453-5590fe828b8b', 'maryam@rillcod.com', 'Maryam Lawal  Salisu', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:36.397359+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('7c8d4dc6-bc3f-40dd-8ef3-4952ee547d7d', 'abundance@rillcod.com', 'IYOBOSASERE ABUNDANCE', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:48.031918+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('582dae2b-b7f9-4415-b4e4-313251aca433', 'rillcohhjhd@gmail.com', 'Abdulwaris Oyarekhuan', 'student', NULL, 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 20:36:36.004+00', '2026-03-11 10:53:42.192932+00', NULL, false, '2026-03-11 10:53:42.542+00', NULL, NULL, 0, 'HILLTOP SCRATCH CLASS', NULL, NULL, NULL, NULL),
	('7d069901-7ed7-4a86-82bc-859c7608ac6d', 'isrealo@rillcod.com', 'Osaretin Isreal Osaretin', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:25.834442+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('8978eba6-9060-49df-9fb7-669c43ead088', 'bumhe@rillcod.com', 'Bumhe Ile-Ojiede', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:40.597949+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('5fe242a9-947d-4ce1-856c-7352f5223680', 'sulemani@rillcod.com', 'sulemani', 'teacher', NULL, NULL, true, false, NULL, NULL, '2026-03-11 14:02:13.213873+00', '2026-03-11 14:02:13.644166+00', NULL, false, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('190b8b34-193c-4029-bf7f-3b1b26ad0d75', 'admin@rillcodacademy.com', 'ADMINISTRATION', 'admin', '+2349116600091', NULL, true, false, NULL, NULL, '2026-02-28 04:05:03.179882+00', '2026-03-11 19:48:58.593234+00', NULL, false, '2026-03-11 19:49:00.067+00', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('8e0c86c0-b644-4cd4-b492-fa6f79a7453c', 'teacher@rillcodacademy.com', 'Demo Teacher', 'teacher', NULL, NULL, true, false, NULL, NULL, '2026-02-28 04:05:04.258819+00', '2026-03-09 21:23:14.776977+00', NULL, false, '2026-03-09 21:23:13.851+00', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('0ff305c7-f526-4901-91d6-b7df3b917136', 'hilltop@rillcod.com', 'hilltop montessori', 'school', '', 'HILLTOP MONTESSORI SCHOOL', true, false, NULL, NULL, '2026-03-09 20:43:04.694691+00', '2026-03-10 21:41:55.093924+00', NULL, false, '2026-03-10 21:41:54.863+00', '86dbd10b-e2cd-428d-8ef9-e6cb6a537795', NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('b4b9b0fa-21cf-4d9b-bbe8-28e5f604a521', 'student@rillcodacademy.com', 'Demo Student', 'student', NULL, NULL, true, false, NULL, NULL, '2026-02-28 04:05:05.044225+00', '2026-03-07 08:09:29.933514+00', NULL, false, '2026-03-07 08:09:29.609+00', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('f05c3d20-9b6a-4ebe-bc9d-1d67941a89f2', 'bew@school.com', 'chikea', 'school', NULL, 'new', true, false, NULL, NULL, '2026-03-11 16:36:15.364834+00', '2026-03-11 16:36:15.820522+00', NULL, false, NULL, 'f869a869-9ad1-4bba-a481-3bbb28eeb867', NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('89b79e23-cab3-4cf7-920e-2794749e590e', 'femi@rillcod.com', 'Femi farukanem Joseph ', 'student', NULL, 'KEY TO SUCCESS EDUCATION CENTRE', true, false, NULL, NULL, '2026-03-11 19:49:51.79092+00', '2026-03-11 19:53:42.069381+00', NULL, false, NULL, '344f1eeb-b175-4740-bf5b-5747a36a5de6', NULL, 0, 'JUNIOR CATEGORY', NULL, NULL, NULL, NULL),
	('a217b2c8-ed1c-41a0-b43c-f47a45500e75', 'amaka@rillcod.com', 'Amaka', 'teacher', '+2348116600091', NULL, true, false, NULL, NULL, '2026-03-09 15:30:38.504991+00', '2026-03-11 20:08:11.972469+00', NULL, false, '2026-03-11 20:08:11.295+00', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL),
	('a62d1fc6-bbea-4e7a-bdee-5e5ee670b2b6', 'imuetinyanc@gmail.com', 'Imuetinyan', 'student', NULL, NULL, true, false, NULL, NULL, '2026-03-11 19:50:03.38453+00', '2026-03-11 19:50:03.560338+00', NULL, false, NULL, NULL, NULL, 0, NULL, NULL, '2021-03-10', NULL, NULL);


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."announcements" ("id", "title", "content", "author_id", "target_audience", "is_active", "created_at", "updated_at") VALUES
	('cc0e8400-e29b-41d4-a716-446655440001', 'Welcome to Rillcod Academy!', 'Welcome all students to the new academic session. We are excited to have you join our programming community.', NULL, 'all', true, '2026-02-25 18:36:29.773285+00', '2026-03-09 09:25:44.101762+00'),
	('cc0e8400-e29b-41d4-a716-446655440002', 'New Course Available', 'We are pleased to announce our new Data Science course starting next month.', NULL, 'students', true, '2026-02-25 18:36:29.773285+00', '2026-03-09 09:25:44.101762+00'),
	('cc0e8400-e29b-41d4-a716-446655440003', 'Holiday Schedule', 'The academy will be closed for the upcoming holiday. Classes will resume on Monday.', NULL, 'all', true, '2026-02-25 18:36:29.773285+00', '2026-03-09 09:25:44.101762+00'),
	('cc0e8400-e29b-41d4-a716-446655440004', 'Teacher Training', 'All teachers are required to attend the training session this Friday.', NULL, 'teachers', true, '2026-02-25 18:36:29.773285+00', '2026-03-09 09:25:44.101762+00'),
	('cc0e8400-e29b-41d4-a716-446655440005', 'Student Achievement', 'Congratulations to our students who completed their projects successfully!', NULL, 'all', true, '2026-02-25 18:36:29.773285+00', '2026-03-09 09:25:44.101762+00');


--
-- Data for Name: programs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."programs" ("id", "name", "description", "duration_weeks", "difficulty_level", "price", "max_students", "is_active", "created_at", "updated_at", "school_id") VALUES
	('880e8400-e29b-41d4-a716-446655440001', 'Web Development Fundamentals', 'Learn the basics of web development with HTML, CSS, and JavaScript', 12, 'beginner', 50000.00, 30, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL),
	('880e8400-e29b-41d4-a716-446655440002', 'Python Programming', 'Master Python programming from basics to advanced concepts', 16, 'intermediate', 75000.00, 25, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL),
	('880e8400-e29b-41d4-a716-446655440003', 'Mobile App Development', 'Build native mobile applications using React Native', 14, 'intermediate', 65000.00, 20, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL),
	('880e8400-e29b-41d4-a716-446655440004', 'Data Science', 'Learn data analysis, visualization, and machine learning', 20, 'advanced', 100000.00, 15, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL),
	('7e53b752-4b8f-4b4c-aa44-b114b453db74', 'ICT Fundamentals', 'Basic computer skills and digital literacy', 8, 'beginner', 50000.00, 20, true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00', NULL),
	('b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'Scratch Programming', 'Visual programming for beginners', 10, 'beginner', 75000.00, 15, true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00', NULL),
	('03d60be9-0a0c-4d50-870b-02adceff18d6', 'HTML/CSS Programming', 'Web development fundamentals', 12, 'beginner', 100000.00, 15, true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00', NULL),
	('264c2a90-b0c9-45b7-a762-57a57c0e3cc7', 'Web Design', 'Creative web design skills', 14, 'intermediate', 120000.00, 12, true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00', NULL),
	('b9203a56-f876-4606-a555-e6e848ac9aaf', 'Robotics Programming', 'Robotics and automation programming', 18, 'advanced', 200000.00, 10, true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00', NULL);


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."classes" ("id", "program_id", "teacher_id", "name", "description", "max_students", "start_date", "end_date", "status", "created_at", "updated_at", "schedule", "current_students", "school_id") VALUES
	('ea93ace5-daf2-48bd-8621-add4271b6eda', '880e8400-e29b-41d4-a716-446655440002', '8e0c86c0-b644-4cd4-b492-fa6f79a7453c', 'Jss1', NULL, 20, '2026-03-17', '2026-03-20', 'scheduled', '2026-03-05 08:47:53.33451+00', '2026-03-05 08:47:53.33451+00', NULL, 0, NULL),
	('b38cfd18-4ea9-4b87-9443-a7bd8b1748ed', '880e8400-e29b-41d4-a716-446655440004', NULL, 'python', NULL, 20, '2026-03-12', '2026-03-05', 'active', '2026-03-06 05:31:11.141569+00', '2026-03-09 09:25:50.668012+00', NULL, 0, NULL),
	('dfb15d77-b8ac-49a3-b68c-848fe91c0059', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'a217b2c8-ed1c-41a0-b43c-f47a45500e75', 'HILLTOP SCRATCH CLASS', NULL, 20, '2026-01-12', '2026-03-27', 'active', '2026-03-10 17:38:58.08593+00', '2026-03-10 18:28:30.416737+00', 'Tuesday 3:00 - 5:00 pm', 7, '86dbd10b-e2cd-428d-8ef9-e6cb6a537795'),
	('21e1b57a-c7e3-4b76-9da8-99e3b5e45afa', '880e8400-e29b-41d4-a716-446655440002', 'd2c26a88-307a-4034-9a1f-ac037e5cc103', 'JUNIOR CATEGORY', NULL, 20, NULL, NULL, 'scheduled', '2026-03-11 19:53:40.013378+00', '2026-03-11 19:53:40.013378+00', NULL, 8, '344f1eeb-b175-4740-bf5b-5747a36a5de6');


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."courses" ("id", "program_id", "title", "description", "content", "duration_hours", "order_index", "is_active", "created_at", "updated_at", "teacher_id", "school_id", "school_name") VALUES
	('990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'HTML Basics', 'Introduction to HTML markup language', 'Learn HTML structure, elements, and semantic markup', 8, 1, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL),
	('990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'CSS Styling', 'Cascading Style Sheets fundamentals', 'Master CSS selectors, properties, and layouts', 10, 2, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL),
	('990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'JavaScript Fundamentals', 'Introduction to JavaScript programming', 'Learn variables, functions, and DOM manipulation', 12, 3, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL),
	('990e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'Python Basics', 'Introduction to Python programming', 'Learn Python syntax, data types, and control structures', 10, 1, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL),
	('990e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'Python OOP', 'Object-Oriented Programming in Python', 'Master classes, objects, and inheritance', 12, 2, true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL),
	('3e675c9a-371c-47b1-8f2b-da8c4cc823d9', NULL, 'AI and Robotics', 'Deep dive into AI and Robotics.', NULL, NULL, NULL, true, '2026-03-11 09:45:41.047643+00', '2026-03-11 09:45:41.047643+00', NULL, NULL, NULL),
	('d5e71de6-932e-4e75-bb8d-df00149a5b67', NULL, 'Data Analysis', 'Deep dive into Data Analysis.', NULL, NULL, NULL, true, '2026-03-11 09:45:41.979993+00', '2026-03-11 09:45:41.979993+00', NULL, NULL, NULL),
	('6ed2f526-6a79-4a8e-821b-67ce9f7ba3d7', NULL, 'Animation', 'Deep dive into Animation.', NULL, NULL, NULL, true, '2026-03-11 09:45:42.842845+00', '2026-03-11 09:45:42.842845+00', NULL, NULL, NULL),
	('ce761643-09b7-4e0f-9fd6-bdece843ca56', NULL, 'AI and Automation', 'Deep dive into AI and Automation.', NULL, NULL, NULL, true, '2026-03-11 09:45:43.58849+00', '2026-03-11 09:45:43.58849+00', NULL, NULL, NULL),
	('ff26de83-7c66-4032-ac2c-20592c7ed236', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'Introduction to Scratch', NULL, NULL, 2, NULL, true, '2026-03-08 20:47:08.42315+00', '2026-03-11 10:39:28.358564+00', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', NULL, NULL);


--
-- Data for Name: assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."assignments" ("id", "course_id", "title", "description", "instructions", "due_date", "max_points", "assignment_type", "is_active", "created_at", "updated_at", "created_by", "class_id", "questions", "school_id", "school_name") VALUES
	('bb0e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', 'HTML Portfolio', 'Create a personal portfolio using HTML', 'Build a 3-page portfolio with proper HTML structure', '2024-02-15 23:59:00+00', 100, 'project', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL, NULL, NULL),
	('bb0e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440002', 'CSS Layout Challenge', 'Design responsive layouts with CSS', 'Create responsive layouts using Flexbox and Grid', '2024-02-20 23:59:00+00', 100, 'homework', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL, NULL, NULL),
	('bb0e8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440003', 'JavaScript Calculator', 'Build a calculator using JavaScript', 'Implement basic arithmetic operations with a user interface', '2024-02-25 23:59:00+00', 100, 'project', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL, NULL, NULL),
	('bb0e8400-e29b-41d4-a716-446655440004', '990e8400-e29b-41d4-a716-446655440004', 'Python Quiz Game', 'Create a quiz game in Python', 'Build a command-line quiz game with score tracking', '2024-03-01 23:59:00+00', 100, 'project', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL, NULL, NULL),
	('bb0e8400-e29b-41d4-a716-446655440005', '990e8400-e29b-41d4-a716-446655440005', 'OOP Project', 'Design a class hierarchy', 'Create a class hierarchy for a library management system', '2024-03-05 23:59:00+00', 100, 'homework', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00', NULL, NULL, NULL, NULL, NULL),
	('343b0d53-fe94-43ca-bb86-b6f3914f09d8', '990e8400-e29b-41d4-a716-446655440002', 'knip', 'do it', 'uhuhihoii', '2026-03-11 18:56:00+00', 10, 'homework', true, '2026-03-10 18:56:25.748992+00', '2026-03-11 10:39:28.358564+00', 'a217b2c8-ed1c-41a0-b43c-f47a45500e75', NULL, NULL, NULL, NULL),
	('91704ccc-8e73-4a76-ac2a-84857f11ab44', '990e8400-e29b-41d4-a716-446655440003', 'Motion', 'Hhjj', 'Cnjbn', '2026-03-05 08:42:00+00', 20, 'homework', true, '2026-03-05 08:43:19.820242+00', '2026-03-11 10:39:28.358564+00', '8e0c86c0-b644-4cd4-b492-fa6f79a7453c', NULL, NULL, NULL, NULL),
	('047c6006-86e2-47db-9ba3-bd7c9ccf275e', 'ff26de83-7c66-4032-ac2c-20592c7ed236', 'Book work', NULL, NULL, NULL, 100, 'homework', true, '2026-03-09 15:21:50.462172+00', '2026-03-11 10:39:28.358564+00', '8e0c86c0-b644-4cd4-b492-fa6f79a7453c', NULL, NULL, NULL, NULL),
	('abb4416c-520a-4aa8-a910-8a64a7061706', 'ff26de83-7c66-4032-ac2c-20592c7ed236', 'scratch on loops', NULL, NULL, '2026-03-11 16:57:00+00', 10, 'homework', true, '2026-03-11 16:57:18.081521+00', '2026-03-11 16:57:18.081521+00', 'a217b2c8-ed1c-41a0-b43c-f47a45500e75', NULL, NULL, NULL, NULL);


--
-- Data for Name: assignment_submissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."assignment_submissions" ("id", "assignment_id", "user_id", "submission_text", "file_url", "submitted_at", "graded_by", "grade", "feedback", "graded_at", "status", "student_id", "portal_user_id", "updated_at", "answers") VALUES
	('6b506fe4-0f64-4db3-aa32-b8e3cfa6dd04', '047c6006-86e2-47db-9ba3-bd7c9ccf275e', NULL, 'This isur', NULL, '2026-03-11 10:56:44.55+00', 'a217b2c8-ed1c-41a0-b43c-f47a45500e75', 86, 'Good', '2026-03-11 10:59:55.401+00', 'graded', NULL, '582dae2b-b7f9-4415-b4e4-313251aca433', '2026-03-11 10:59:54.731741+00', NULL);


--
-- Data for Name: class_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."class_sessions" ("id", "class_id", "session_date", "start_time", "end_time", "topic", "description", "is_active", "created_at", "updated_at", "title", "location", "meeting_url", "is_online", "status") VALUES
	('7563b670-7e9a-4dd7-90b9-2adf536bd030', 'dfb15d77-b8ac-49a3-b68c-848fe91c0059', '2026-03-10', NULL, NULL, 'Session on 3/10/2026', NULL, true, '2026-03-10 18:28:46.581963+00', '2026-03-10 18:28:46.581963+00', NULL, NULL, NULL, false, 'scheduled');


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."attendance" ("id", "session_id", "user_id", "status", "notes", "created_at", "updated_at", "student_id", "recorded_by") VALUES
	('6ca9b397-0085-419f-9de9-bb9473733fad', '7563b670-7e9a-4dd7-90b9-2adf536bd030', '582dae2b-b7f9-4415-b4e4-313251aca433', 'absent', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL),
	('3b3ed30f-c75a-4bb5-992d-e17e9c9a209b', '7563b670-7e9a-4dd7-90b9-2adf536bd030', '5a87f1f3-5e99-4a9a-9588-458127c8fa6d', 'present', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL),
	('feb43eb5-bf4b-42d9-af67-b9be46fa159f', '7563b670-7e9a-4dd7-90b9-2adf536bd030', 'b7b40602-c01e-4fdc-b363-f2cf3543ba70', 'present', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL),
	('13df8ac7-b07b-4f0a-a30b-6174977df486', '7563b670-7e9a-4dd7-90b9-2adf536bd030', '1f4ba692-a50a-4ef5-870f-f50534c47e1f', 'present', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL),
	('0f47df4f-e353-4dab-8020-8f9119fc6f2c', '7563b670-7e9a-4dd7-90b9-2adf536bd030', '2b78523e-1406-41e0-a876-5a05d9e0655c', 'present', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL),
	('3679c09a-aa96-4197-8844-9479b7e05a5c', '7563b670-7e9a-4dd7-90b9-2adf536bd030', '42b94ceb-577a-470e-81b2-b27156b2d516', 'present', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL),
	('b71e121b-a7b4-4709-b9fa-0c2dfec9ea4e', '7563b670-7e9a-4dd7-90b9-2adf536bd030', 'f6ceefff-125f-4e02-9f63-75aa2dd8dc16', 'present', NULL, '2026-03-10 18:28:57.001553+00', '2026-03-10 18:28:57.001553+00', NULL, NULL);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: badges; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: cbt_exams; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."cbt_exams" ("id", "title", "description", "program_id", "duration_minutes", "total_questions", "passing_score", "is_active", "start_date", "end_date", "created_at", "updated_at") VALUES
	('ee0e8400-e29b-41d4-a716-446655440001', 'Web Development Midterm', 'Midterm examination for Web Development Fundamentals', '880e8400-e29b-41d4-a716-446655440001', 60, 20, 70, true, '2024-02-15 09:00:00+00', '2024-02-15 17:00:00+00', '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('ee0e8400-e29b-41d4-a716-446655440003', 'Mobile App Quiz', 'Quiz for Mobile App Development', '880e8400-e29b-41d4-a716-446655440003', 45, 15, 60, true, '2024-02-20 09:00:00+00', '2024-02-20 17:00:00+00', '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('887bba8e-b0d4-4987-9306-495e4cef9501', 'Gjj', 'Terminal', '7e53b752-4b8f-4b4c-aa44-b114b453db74', 10, 1, 70, true, '2026-03-05 08:44:00+00', '2026-03-05 08:57:00+00', '2026-03-05 08:45:37.440092+00', '2026-03-05 08:45:37.440092+00'),
	('ee0e8400-e29b-41d4-a716-446655440002', 'Python Final Exam', 'Final examination for Python Programming', '880e8400-e29b-41d4-a716-446655440002', 90, 2, 75, true, '2024-03-15 08:00:00+00', '2024-03-15 16:00:00+00', '2026-02-25 18:36:29.773285+00', '2026-03-10 19:22:02.557377+00');


--
-- Data for Name: cbt_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."cbt_questions" ("id", "exam_id", "question_text", "question_type", "options", "correct_answer", "points", "order_index", "created_at", "updated_at") VALUES
	('ff0e8400-e29b-41d4-a716-446655440001', 'ee0e8400-e29b-41d4-a716-446655440001', 'What does HTML stand for?', 'multiple_choice', '["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlink and Text Markup Language"]', 'Hyper Text Markup Language', 5, 1, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('ff0e8400-e29b-41d4-a716-446655440002', 'ee0e8400-e29b-41d4-a716-446655440001', 'Which CSS property controls the text size?', 'multiple_choice', '["font-size", "text-size", "size", "font-style"]', 'font-size', 5, 2, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('ff0e8400-e29b-41d4-a716-446655440005', 'ee0e8400-e29b-41d4-a716-446655440003', 'What is React Native?', 'multiple_choice', '["A framework for building mobile apps", "A database system", "A programming language", "A web server"]', 'A framework for building mobile apps', 5, 1, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('ea6f7004-c782-4fc0-a256-db2671f0f602', '887bba8e-b0d4-4987-9306-495e4cef9501', 'What is this', 'multiple_choice', '["Book", "Mango ", "Onion", "Pawpaw "]', 'B', 5, 1, '2026-03-05 08:45:38.021371+00', '2026-03-05 08:45:38.021371+00'),
	('ff0e8400-e29b-41d4-a716-446655440003', 'ee0e8400-e29b-41d4-a716-446655440002', 'What is the correct way to create a function in Python?', 'multiple_choice', '["def function_name():", "function function_name():", "create function_name():", "new function_name():"]', 'def function_name():', 5, 1, '2026-02-25 18:36:29.773285+00', '2026-03-10 19:22:03.011859+00'),
	('ff0e8400-e29b-41d4-a716-446655440004', 'ee0e8400-e29b-41d4-a716-446655440002', 'Which of the following is a Python data type?', 'multiple_choice', '["list", "array", "vector", "sequence"]', 'list', 5, 2, '2026-02-25 18:36:29.773285+00', '2026-03-10 19:22:03.449679+00');


--
-- Data for Name: cbt_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: certificates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: content_library; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: content_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_materials; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: discussion_topics; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: discussion_replies; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: discussion_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: enrollments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."enrollments" ("id", "user_id", "program_id", "role", "enrollment_date", "status", "completion_date", "grade", "notes", "created_at", "updated_at", "progress_pct", "last_activity_at") VALUES
	('fab953bc-d707-41f1-a125-43d97f07765a', '582dae2b-b7f9-4415-b4e4-313251aca433', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('b71434a3-b5a0-43c3-9c33-84361868efb6', '5a87f1f3-5e99-4a9a-9588-458127c8fa6d', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('404562eb-60b3-45e4-b39d-3bfe2a7138bd', 'b7b40602-c01e-4fdc-b363-f2cf3543ba70', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('08833cd9-3080-41d3-8f07-f27d5883810c', '1f4ba692-a50a-4ef5-870f-f50534c47e1f', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('4832b546-0755-4506-9cb0-94a78324d144', '2b78523e-1406-41e0-a876-5a05d9e0655c', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('63c8f214-7244-484b-bc7e-352a12921a0f', '42b94ceb-577a-470e-81b2-b27156b2d516', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('1eacb0f9-fc1e-4816-939d-12ba37726962', 'f6ceefff-125f-4e02-9f63-75aa2dd8dc16', 'b5b6e990-08ac-4981-9f2d-e463e3ab7037', 'student', '2026-03-10', 'active', NULL, NULL, NULL, '2026-03-10 18:28:31.304065+00', '2026-03-10 18:28:31.304065+00', 0, NULL),
	('7d68f46b-f91a-4f25-b9e4-ccb0f2480e20', '8978eba6-9060-49df-9fb7-669c43ead088', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('2698cb13-3541-42cc-a9fa-7cae4481f7fb', '137cf602-7159-4763-af4f-d11334bff70e', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('1f152b22-b225-45c6-80c8-a6ffbbd8e878', '89b79e23-cab3-4cf7-920e-2794749e590e', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('d0d92013-251e-421c-853f-18017026d24a', '3bfba220-35fb-494f-a1d9-aff0c8ab769b', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('fd2e19cc-0c3f-407c-82ce-b2da1ec883f1', '7c8d4dc6-bc3f-40dd-8ef3-4952ee547d7d', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('9761bda2-dd62-47bc-ba2d-e942e91ea3a3', '24dd6097-bbf0-4297-aa5c-b068a315ed8c', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('0bf895ad-434a-4902-9e4b-5c17c863b5bb', '46e14d34-f182-4592-8453-5590fe828b8b', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL),
	('87ed3451-f02a-4384-933c-f6ead75d84b7', '7d069901-7ed7-4a86-82bc-859c7608ac6d', '880e8400-e29b-41d4-a716-446655440002', 'student', '2026-03-11', 'active', NULL, NULL, NULL, '2026-03-11 19:53:46.795436+00', '2026-03-11 19:53:46.795436+00', 0, NULL);


--
-- Data for Name: exams; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: exam_attempts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: exam_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: flagged_content; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: report_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: generated_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: grade_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: leaderboards; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: lessons; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lessons" ("id", "course_id", "title", "description", "lesson_type", "status", "duration_minutes", "session_date", "video_url", "content", "order_index", "created_by", "created_at", "updated_at", "content_layout", "lesson_notes", "school_id", "school_name") VALUES
	('d0958636-ed0d-4f52-9ca9-5312bb4ae695', 'ff26de83-7c66-4032-ac2c-20592c7ed236', 'Scratch Programming Beginners', 'This course introduces young learners to the fundamentals of programming using Scratch, a visual programming language. Students will create interactive stories, games, and animations while developing logical thinking and problem-solving skills.', 'interactive', 'draft', NULL, NULL, NULL, NULL, NULL, 'a217b2c8-ed1c-41a0-b43c-f47a45500e75', '2026-03-11 09:03:35.555008+00', '2026-03-11 09:03:35.555008+00', '[]', NULL, NULL, NULL);


--
-- Data for Name: lesson_materials; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: lesson_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lesson_plans" ("id", "lesson_id", "objectives", "activities", "assessment_methods", "staff_notes", "created_at", "updated_at", "summary_notes") VALUES
	('1a61dd4e-3779-4fff-8bec-0cab80833357', 'd0958636-ed0d-4f52-9ca9-5312bb4ae695', 'Understand the basic concepts of programming and computational thinking.
Create simple animations and interactive stories using Scratch.
Develop problem-solving and logical reasoning skills.
Collaborate and share projects with peers.', 'Week 1 — Introduction to Scratch:
• Explore the Scratch interface
• Create a simple project with a moving sprite
• Share projects on the class Scratch studio

Week 2 — Basic Motion and Events:
• Create a project where a sprite moves in response to key presses
• Experiment with different motion blocks
• Share and discuss projects with classmates

Week 3 — Loops and Loops Forever:
• Create a project where a sprite performs a repeating action
• Experiment with different loop blocks
• Share and present projects to the class

Week 4 — Conditional Statements:
• Create a project where a sprite changes direction based on a condition
• Experiment with different conditional blocks
• Share and discuss projects with classmates

Week 5 — Variables and Data:
• Create a project that uses a variable to keep score
• Experiment with different variable blocks
• Share and present projects to the class

Week 6 — Creating Interactive Stories:
• Plan and create a simple interactive story
• Experiment with different storytelling techniques
• Share and present stories to the class

Week 7 — Creating Simple Games:
• Plan and create a simple game
• Experiment with different game mechanics
• Share and play games with classmates

Week 8 — Advanced Animation Techniques:
• Create an animated character with multiple costumes
• Experiment with different animation techniques
• Share and present animations to the class

Week 9 — Collaborative Projects:
• Form teams and plan a collaborative project
• Combine individual projects into a larger project
• Share and present collaborative projects to the class

Week 10 — Debugging and Troubleshooting:
• Identify and fix bugs in existing projects
• Use the debugger tool to find and fix issues
• Share and discuss debugging techniques with classmates

Week 11 — Final Project Planning:
• Choose a topic for the final project
• Create a project plan and timeline
• Share project plans with the class for feedback

Week 12 — Final Project Presentation:
• Complete and refine the final project
• Prepare a presentation to share the project
• Present and celebrate final projects with the class', 'Continuous assessment through project creation, peer reviews, and presentations. Final project presentations will be evaluated based on creativity, functionality, and teamwork.', 'Grade: Basic 1–Basic 3 | Duration: 12 weeks
Materials: Scratch software (available online for free), Computers or tablets with internet access, Project planning sheets, Printed guides and tutorials, Class Scratch studio for sharing projects', '2026-03-11 09:03:37.210408+00', '2026-03-11 09:03:37.210408+00', NULL);


--
-- Data for Name: lesson_progress; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lesson_progress" ("id", "lesson_id", "portal_user_id", "status", "progress_percentage", "time_spent_minutes", "completed_at", "created_at", "updated_at", "last_accessed_at") VALUES
	('1e2490b4-52b1-44e6-932c-274379eefe94', 'd0958636-ed0d-4f52-9ca9-5312bb4ae695', '582dae2b-b7f9-4415-b4e4-313251aca433', 'completed', 100, 2, '2026-03-11 10:55:23.756+00', '2026-03-11 10:55:23.825244+00', '2026-03-11 10:55:28.729869+00', '2026-03-11 10:55:23.825244+00');


--
-- Data for Name: live_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: live_session_attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: live_session_breakout_rooms; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: live_session_breakout_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: live_session_polls; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: live_session_poll_options; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: live_session_poll_responses; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."notification_templates" ("id", "name", "type", "subject", "content", "variables", "is_active", "created_at", "updated_at") VALUES
	('861b25d8-661c-40ff-8bd5-b81f252e1314', 'Assignment Reminder', 'email', 'Reminder: Assignment {{assignment_name}} is due soon', '<p>Hi {{user_name}},</p><p>This is a reminder that your assignment <strong>{{assignment_name}}</strong> is due on {{due_date}}.</p><p>Please ensure you submit it on time.</p>', '{"due_date": "string", "user_name": "string", "assignment_name": "string"}', true, '2026-03-02 08:19:41.404501+00', '2026-03-02 08:19:41.404501+00'),
	('8463d0d5-97ef-4e7a-8f5b-9ee13405ea90', 'Grade Published', 'email', 'New Grade Published: {{course_name}}', '<p>Hi {{user_name}},</p><p>A new grade has been published for your work in <strong>{{course_name}}</strong>.</p><p>Grade: {{grade}}</p><p>Comment: {{notes}}</p>', '{"grade": "string", "notes": "string", "user_name": "string", "course_name": "string"}', true, '2026-03-02 08:19:41.404501+00', '2026-03-02 08:19:41.404501+00'),
	('07268866-0eaa-4b6d-8d25-ae596eae409b', 'New Announcement', 'email', 'New Announcement: {{title}}', '<p>A new announcement has been posted:</p><h3>{{title}}</h3><p>{{content}}</p>', '{"title": "string", "content": "string"}', true, '2026-03-02 08:19:41.404501+00', '2026-03-02 08:19:41.404501+00'),
	('6e616c38-bfd3-4b4a-8aad-cc82dcc57c8e', 'Announcement SMS', 'sms', NULL, 'LMS Announcement: {{title}}. Check your portal for details.', '{"title": "string"}', true, '2026-03-02 08:19:41.404501+00', '2026-03-02 08:19:41.404501+00');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: payment_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."payment_accounts" ("id", "owner_type", "school_id", "label", "bank_name", "account_number", "account_name", "account_type", "payment_note", "is_active", "created_by", "created_at", "updated_at") VALUES
	('2a8e7810-87e4-4065-8f27-f9b7a759b6f9', 'rillcod', NULL, 'Termly Fees', 'Providus Bank', '7901178957', 'RILLCOD LTD', 'current', NULL, true, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-07 19:48:54.297515+00', '2026-03-07 19:48:54.297515+00');


--
-- Data for Name: payment_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."payment_transactions" ("id", "school_id", "portal_user_id", "course_id", "amount", "currency", "payment_method", "payment_status", "transaction_reference", "external_transaction_id", "payment_gateway_response", "paid_at", "refunded_at", "refund_reason", "created_at", "updated_at") VALUES
	('8a28a775-4cfa-410a-9a90-8c0ca527e56f', NULL, NULL, NULL, 45000.00, 'NGN', 'paystack', 'pending', 'REG-1772973784855-7fc0b7', NULL, '{"student_id": "7fc0b711-747d-40a2-85c6-a185f29833db", "parent_email": "dfgA@hhjj.com", "payment_type": "registration", "student_name": "Ggh", "enrollment_type": "bootcamp"}', NULL, NULL, NULL, '2026-03-08 12:43:04.855+00', '2026-03-08 12:43:05.368791+00'),
	('fd2786fb-77e9-4509-b0d9-aefd3b2c388c', NULL, NULL, NULL, 25000.00, 'NGN', 'paystack', 'pending', 'REG-1772999457467-7e6ea2', NULL, '{"student_id": "7e6ea2e5-bbc2-4811-a607-5303c979ff38", "parent_email": "rillcod@gmail.com", "payment_type": "registration", "student_name": "Airhienbuwa Osahon", "enrollment_type": "school"}', NULL, NULL, NULL, '2026-03-08 19:50:57.467+00', '2026-03-08 19:50:57.851571+00'),
	('b6abeea9-6d0c-405e-bf68-fe8c1a361153', NULL, NULL, NULL, 35000.00, 'NGN', 'paystack', 'pending', 'REG-1773068435408-295be0', NULL, '{"student_id": "295be003-5e58-4752-a688-c1d149de3714", "parent_email": "pppa@emjej.com", "payment_type": "registration", "student_name": "Older", "enrollment_type": "bootcamp"}', NULL, NULL, NULL, '2026-03-09 15:00:35.408+00', '2026-03-09 15:00:35.744883+00'),
	('bc85a1cd-1bc4-4b7f-8789-74bc8380efa3', NULL, NULL, NULL, 30000.00, 'NGN', 'paystack', 'pending', 'REG-1773253020776-3f661f', NULL, '{"student_id": "3f661f97-f5d9-4e51-8199-12cae0979240", "parent_email": "imuetinyanc@gmail.com", "payment_type": "registration", "student_name": "Imuetinyan", "enrollment_type": "online"}', NULL, NULL, NULL, '2026-03-11 18:17:00.776+00', '2026-03-11 18:17:01.187009+00');


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: point_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: portfolio_projects; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: prospective_students; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."prospective_students" ("id", "full_name", "email", "parent_name", "parent_phone", "parent_email", "grade", "age", "gender", "school_id", "school_name", "course_interest", "preferred_schedule", "hear_about_us", "status", "is_active", "is_deleted", "notes", "created_at", "updated_at") VALUES
	('2920e4cf-0249-4861-ac23-34ecad73b329', 'Chibueze Prosper ', 'rillcod@gmail.com', 'Bbb', '999999999', 'rillcod@gmail.com', 'JSS3', 12, 'Male', NULL, 'Ggg', 'JSS3 Summer School 2026', 'Onsite', 'Summer School Registration Form', 'pending', true, false, NULL, '2026-03-04 14:18:15.344+00', '2026-03-04 14:18:15.344+00'),
	('4954705b-1452-4c80-947f-465606dc3415', 'Angelo Osasere Eguavoen', 'admin@quiverfullschool.ng', 'Yyhh', '25388899098', 'admin@quiverfullschool.ng', 'SS1', 12, 'Female', NULL, 'Direct / Summer School', 'JSS3 Summer School 2026', 'Hybrid', 'Summer School Registration Form', 'pending', true, false, NULL, '2026-03-08 12:22:49.093+00', '2026-03-08 12:22:49.093+00');


--
-- Data for Name: report_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."report_settings" ("id", "school_id", "teacher_id", "org_name", "org_tagline", "org_address", "org_phone", "org_email", "org_website", "logo_url", "default_term", "default_instructor", "created_at", "updated_at") VALUES
	('87ba9222-52ad-40ad-8682-d54a056648de', NULL, NULL, 'Rillcod Technologies', 'Excellence in Educational Technology', '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City', '08116600091', 'rillcod@gmail.com', 'www.rillcod.com', NULL, 'Termly', NULL, '2026-03-05 19:56:37.069519+00', '2026-03-05 19:56:37.069519+00'),
	('c8629ecd-ec38-468d-91d3-04dd03934190', NULL, NULL, 'Rillcod Technologies', 'Excellence in Educational Technology', '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City', '08116600091', 'rillcod@gmail.com', 'www.rillcod.com', NULL, 'Termly', NULL, '2026-03-06 05:08:07.509276+00', '2026-03-06 05:08:07.509276+00'),
	('de73513c-ac49-4b9e-a5be-3ffb6589d51b', NULL, NULL, 'Rillcod Technologies', 'Excellence in Educational Technology', '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City', '08116600091', 'rillcod@gmail.com', 'www.rillcod.com', NULL, 'Termly', NULL, '2026-03-06 17:57:09.459999+00', '2026-03-06 17:57:09.459999+00'),
	('38993183-479e-4b97-aca9-b713b7f171ee', NULL, NULL, 'Rillcod Technologies', 'Excellence in Educational Technology', '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City', '08116600091', 'rillcod@gmail.com', 'www.rillcod.com', NULL, 'Termly', NULL, '2026-03-07 10:03:51.423973+00', '2026-03-07 10:03:51.423973+00');


--
-- Data for Name: student_enrollments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: student_progress; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: student_progress_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."student_progress_reports" ("id", "student_id", "teacher_id", "school_id", "course_id", "student_name", "school_name", "section_class", "course_name", "report_date", "report_term", "report_period", "instructor_name", "current_module", "next_module", "learning_milestones", "course_duration", "theory_score", "practical_score", "attendance_score", "overall_score", "participation_grade", "projects_grade", "homework_grade", "assignments_grade", "overall_grade", "key_strengths", "areas_for_growth", "instructor_assessment", "has_certificate", "certificate_text", "course_completed", "proficiency_level", "verification_code", "is_published", "created_at", "updated_at", "photo_url", "school_section", "fee_label", "fee_amount", "fee_status", "show_payment_notice") VALUES
	('6e5d7338-0eee-47a8-8560-d7662b3f6000', 'b4b9b0fa-21cf-4d9b-bbe8-28e5f604a521', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', NULL, '990e8400-e29b-41d4-a716-446655440001', 'Demo Student', 'Ochad Kids', 'Cohort A', 'HTML Basics', '2026-03-06', '2nd term', NULL, 'Demo Admin', NULL, NULL, '{}', 'Termly', 68.00, 81.00, 86.00, 77.00, 'Good', 'Exceeded Expectations', 'Satisfactory', 'Satisfactory', 'B', NULL, NULL, NULL, true, 'This document officially recognizes that Demo Student has successfully completed the intensive study programme in HTML Basics.', 'Completed — 2nd term', 'advanced', '57d18528', true, '2026-03-06 18:41:47.766773+00', '2026-03-08 04:58:15.807699+00', NULL, 'school', NULL, NULL, NULL, true),
	('96786b63-c5fe-46ad-bc9c-5eaea077d997', '582dae2b-b7f9-4415-b4e4-313251aca433', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', NULL, '990e8400-e29b-41d4-a716-446655440001', 'Abdulwaris Oyarekhuan', 'HILLTOP MONTESSORI SCHOOL', 'Basic 1', 'HTML Basics', '2026-03-10', 'First Term', NULL, 'Demo Admin', NULL, NULL, '{}', 'Termly', 90.00, 97.00, 90.00, 93.00, 'Very Good', 'Good', 'Very Good', 'Good', 'A', 'Abdulwaris Oyarekhuan demonstrates exceptional grasp of  concepts, particularly in practical implementation. Their Good project performance highlights strong problem-solving abilities.', 'While proficient in theory, Abdulwaris Oyarekhuan can improve by dedicating more time to independent research and collaborative projects. Increasing class participation will also help solidify understanding.', NULL, true, 'This document officially recognizes that Abdulwaris Oyarekhuan has successfully completed the intensive study programme in HTML Basics.', 'Completed — First Term', 'intermediate', 'dc1b9a82', true, '2026-03-10 05:59:39.095576+00', '2026-03-10 05:59:38.878+00', NULL, 'school', NULL, NULL, NULL, true);


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."system_settings" ("id", "setting_key", "setting_value", "description", "category", "is_public", "created_at", "updated_at") VALUES
	('dd0e8400-e29b-41d4-a716-446655440001', 'site_name', 'Rillcod Academy', 'Name of the academy', 'general', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('dd0e8400-e29b-41d4-a716-446655440002', 'site_description', 'Leading programming academy in Nigeria', 'Site description', 'general', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('dd0e8400-e29b-41d4-a716-446655440003', 'contact_email', 'contact@rillcod.com', 'Contact email address', 'contact', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('dd0e8400-e29b-41d4-a716-446655440004', 'contact_phone', '+2348012345678', 'Contact phone number', 'contact', true, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('dd0e8400-e29b-41d4-a716-446655440005', 'maintenance_mode', 'false', 'System maintenance mode', 'system', false, '2026-02-25 18:36:29.773285+00', '2026-02-25 18:36:29.773285+00'),
	('0d774bfb-20af-4c11-b73d-305c58250b8f', 'academy_name', 'Rillcod Academy', 'Name of the academy', 'general', true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00'),
	('dc76396a-927b-4756-957e-a63a095f6213', 'academy_email', 'info@rillcod.com', 'Primary contact email', 'general', true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00'),
	('a700ba50-3533-4270-9c7a-264457cc1457', 'academy_phone', '+234 123 456 7890', 'Primary contact phone', 'general', true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00'),
	('f3b57b15-a6b3-4686-b493-1c7325516966', 'academy_address', 'Lagos, Nigeria', 'Academy address', 'general', true, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00'),
	('148ffe7c-758a-4355-a9d7-d6a52846d650', 'max_students_per_class', '20', 'Maximum students allowed per class', 'general', false, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00'),
	('4280254c-189f-4624-8937-b647e8d718d1', 'auto_approve_students', 'false', 'Automatically approve student registrations', 'general', false, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00'),
	('17a3cce1-cd7c-4499-9554-3c80aaaf4d53', 'require_teacher_approval', 'true', 'Require admin approval for teachers', 'general', false, '2026-02-28 08:36:20.586573+00', '2026-02-28 08:36:20.586573+00');


--
-- Data for Name: teacher_schools; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."teacher_schools" ("id", "teacher_id", "school_id", "assigned_by", "assigned_at", "is_primary", "notes") VALUES
	('233ef609-7850-4592-899c-128d16bf936d', 'a217b2c8-ed1c-41a0-b43c-f47a45500e75', '86dbd10b-e2cd-428d-8ef9-e6cb6a537795', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-09 20:46:07.558865+00', false, NULL),
	('63685577-a5b1-47aa-9c7b-96b3870513d0', 'd2c26a88-307a-4034-9a1f-ac037e5cc103', '344f1eeb-b175-4740-bf5b-5747a36a5de6', '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 19:15:34.606285+00', false, NULL);


--
-- Data for Name: teachers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: timetables; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."timetables" ("id", "school_id", "title", "section", "academic_year", "term", "is_active", "created_by", "created_at", "updated_at") VALUES
	('f9e3c0c2-6414-4289-8fae-e06f6d0335d4', '86dbd10b-e2cd-428d-8ef9-e6cb6a537795', 'CODING CLASS FOR KIDS', 'Primary', '2025/2026', 'Third Term', true, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-07 19:10:30.52348+00', '2026-03-07 19:10:30.52348+00'),
	('4f2cbc28-a57a-4e8f-91d4-01cc6cce85a5', 'f869a869-9ad1-4bba-a481-3bbb28eeb867', '3RD TERM', NULL, '2025/2026', 'Third Term', true, '190b8b34-193c-4029-bf7f-3b1b26ad0d75', '2026-03-11 17:15:13.359652+00', '2026-03-11 17:15:13.359652+00');


--
-- Data for Name: timetable_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: topic_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_badges; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_points; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- PostgreSQL database dump complete
--

-- \unrestrict 6KJZOrp6UuzmUqL2qpF1WaXNVETw3shnezVMbvHbE1x4GR9VMQWc3zVa9QjnOGh

RESET ALL;
