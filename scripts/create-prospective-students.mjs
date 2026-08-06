// Script to create prospective_students table in Supabase
// Run with: node scripts/create-prospective-students.mjs

import { runSql } from './_credentials.mjs';

const sql = `
CREATE TABLE IF NOT EXISTS public.prospective_students (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          text NOT NULL,
  email              text NOT NULL,
  parent_name        text,
  parent_phone       text,
  parent_email       text,
  grade              text,
  age                integer,
  gender             text,
  school_id          uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name        text,
  course_interest    text,
  preferred_schedule text,
  hear_about_us      text,
  status             text NOT NULL DEFAULT 'pending',
  is_active          boolean NOT NULL DEFAULT false,
  is_deleted         boolean NOT NULL DEFAULT false,
  notes              text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE public.prospective_students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'prospective_students' AND policyname = 'Allow public insert'
  ) THEN
    CREATE POLICY "Allow public insert"
      ON public.prospective_students
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'prospective_students' AND policyname = 'Allow authenticated read'
  ) THEN
    CREATE POLICY "Allow authenticated read"
      ON public.prospective_students
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'prospective_students' AND policyname = 'Allow authenticated update'
  ) THEN
    CREATE POLICY "Allow authenticated update"
      ON public.prospective_students
      FOR UPDATE
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prospective_students_email  ON public.prospective_students(email);
CREATE INDEX IF NOT EXISTS idx_prospective_students_status ON public.prospective_students(status);
`;

// This used to POST to /rest/v1/rpc/exec_sql and then /pg/query. Neither
// endpoint exists — the comment beside the second call said as much — so the
// script could only ever print the SQL and ask for it to be pasted in by hand.
// It runs through the Management API now, the same path migrate.mjs uses.
const { ok, status, body } = await runSql(sql);

if (ok) {
    console.log('✅ Table created successfully!');
} else {
    console.error('❌ Error:', status, body);
    console.log('\n📋 Or run this SQL manually in Supabase Dashboard → SQL Editor:\n');
    console.log(sql);
    process.exit(1);
}
