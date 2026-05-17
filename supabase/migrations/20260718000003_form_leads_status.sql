ALTER TABLE form_leads
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'enrolled', 'lost'));
