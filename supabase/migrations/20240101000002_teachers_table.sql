CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  subjects TEXT[] DEFAULT '{}',
  experience_years INTEGER DEFAULT 0,
  education TEXT,
  bio TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES portal_users(id)
);

CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view teachers" ON teachers FOR SELECT USING (true);
CREATE POLICY "Admins can manage teachers" ON teachers FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Teachers can update their own profile" ON teachers FOR UPDATE USING (id = auth.uid());
