-- Keep academic grade, school arm, and programme section as separate data.
ALTER TABLE public.portal_users ADD COLUMN IF NOT EXISTS class_arm text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_arm text;
ALTER TABLE public.registration_batches ADD COLUMN IF NOT EXISTS class_arm text;
ALTER TABLE public.registration_results ADD COLUMN IF NOT EXISTS class_arm text;

ALTER TABLE public.portal_users DROP CONSTRAINT IF EXISTS portal_users_class_arm_check;
ALTER TABLE public.portal_users ADD CONSTRAINT portal_users_class_arm_check CHECK (class_arm IS NULL OR class_arm ~ '^[A-Z0-9]{1,4}$');
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_class_arm_check;
ALTER TABLE public.students ADD CONSTRAINT students_class_arm_check CHECK (class_arm IS NULL OR class_arm ~ '^[A-Z0-9]{1,4}$');