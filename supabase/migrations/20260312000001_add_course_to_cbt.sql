-- Add course_id to cbt_exams to allow linking exams directly to courses
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'cbt_exams' AND column_name = 'course_id') THEN
        ALTER TABLE cbt_exams ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
    END IF;
END $$;
