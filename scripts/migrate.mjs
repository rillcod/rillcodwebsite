// Run: node scripts/migrate.mjs
// Creates the prospective_students table via Supabase Management API

const PROJECT_REF = 'akaorqukdoawacvxsdij';
const SERVICE_ROLE_KEY = 'sb_secret_Vdui5JfPYV553qZwmCHPbw_JWXmcfvW';

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prospective_students' AND policyname='Allow public insert') THEN
    CREATE POLICY "Allow public insert" ON public.prospective_students FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prospective_students' AND policyname='Allow authenticated read') THEN
    CREATE POLICY "Allow authenticated read" ON public.prospective_students FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prospective_students' AND policyname='Allow authenticated update') THEN
    CREATE POLICY "Allow authenticated update" ON public.prospective_students FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prospective_students_email  ON public.prospective_students(email);
CREATE INDEX IF NOT EXISTS idx_prospective_students_status ON public.prospective_students(status);
`;

const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
    }
);

const body = await res.text();

if (res.ok) {
    console.log('✅ prospective_students table created successfully!');
} else {
    console.error('❌ Failed:', res.status, body);
}
