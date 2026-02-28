ALTER TABLE teachers DROP CONSTRAINT IF EXISTS teachers_id_fkey;
ALTER TABLE teachers ALTER COLUMN id SET DEFAULT gen_random_uuid();
