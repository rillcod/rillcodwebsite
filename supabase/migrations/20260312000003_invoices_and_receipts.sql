-- Migration to add Invoice and Receipt management
-- Date: 2026-03-12

-- 1. Create Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT UNIQUE NOT NULL,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    portal_user_id UUID REFERENCES portal_users(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    status TEXT DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
    due_date TIMESTAMP WITH TIME ZONE,
    items JSONB DEFAULT '[]'::jsonb, -- [{description, quantity, unit_price, total}]
    notes TEXT,
    payment_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Add receipt_url to payment_transactions if not exists
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- 3. RLS for Invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on invoices"
ON invoices FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Schools can manage their own invoices"
ON invoices FOR ALL
TO authenticated
USING (school_id IN (SELECT school_id FROM portal_users WHERE id = auth.uid()));

CREATE POLICY "Students can view their own invoices"
ON invoices FOR SELECT
TO authenticated
USING (portal_user_id = auth.uid());

-- 4. Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    seq_val INT;
BEGIN
    year_prefix := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-';
    SELECT count(*) + 1 INTO seq_val FROM invoices WHERE invoice_number LIKE year_prefix || '%';
    NEW.invoice_number := year_prefix || LPAD(seq_val::text, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW
WHEN (NEW.invoice_number IS NULL)
EXECUTE FUNCTION generate_invoice_number();
