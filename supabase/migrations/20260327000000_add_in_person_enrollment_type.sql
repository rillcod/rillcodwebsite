-- Add 'in_person' to the enrollment_type CHECK constraints on both
-- students and portal_users tables.
--
-- The existing constraint only allowed: school | bootcamp | online
-- In-person centre registrations were failing with a CHECK violation
-- because the code defaults to 'in_person' and the fees table includes it.

-- students table
ALTER TABLE "public"."students"
  DROP CONSTRAINT IF EXISTS "students_enrollment_type_check";

ALTER TABLE "public"."students"
  ADD CONSTRAINT "students_enrollment_type_check"
  CHECK (enrollment_type = ANY (ARRAY['school'::text, 'bootcamp'::text, 'online'::text, 'in_person'::text]));

-- portal_users table
ALTER TABLE "public"."portal_users"
  DROP CONSTRAINT IF EXISTS "portal_users_enrollment_type_check";

ALTER TABLE "public"."portal_users"
  ADD CONSTRAINT "portal_users_enrollment_type_check"
  CHECK (enrollment_type = ANY (ARRAY['school'::text, 'bootcamp'::text, 'online'::text, 'in_person'::text]));
