-- Link form_leads back to CRM records created during reconciliation
ALTER TABLE form_leads
  ADD COLUMN IF NOT EXISTS contact_id  UUID REFERENCES customer_contact_book(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospective_students(id)   ON DELETE SET NULL;
