-- Migration to add Receipts table
-- Date: 2026-03-12

-- 1. Create Receipts table
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT UNIQUE NOT NULL,
    transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES portal_users(id) ON DELETE SET NULL,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'NGN',
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    pdf_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. RLS for Receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all receipts"
ON receipts FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Schools can view their own receipts"
ON receipts FOR SELECT
TO authenticated
USING (school_id IN (SELECT school_id FROM portal_users WHERE id = auth.uid()));

CREATE POLICY "Students can view their own receipts"
ON receipts FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- 3. Function to generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    seq_val INT;
BEGIN
    year_prefix := 'RCP-' || TO_CHAR(NOW(), 'YYYY') || '-';
    SELECT count(*) + 1 INTO seq_val FROM receipts WHERE receipt_number LIKE year_prefix || '%';
    NEW.receipt_number := year_prefix || LPAD(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_receipt_number
BEFORE INSERT ON receipts
FOR EACH ROW
WHEN (NEW.receipt_number IS NULL)
EXECUTE FUNCTION generate_receipt_number();
