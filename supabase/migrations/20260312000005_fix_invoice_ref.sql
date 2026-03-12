-- Migration to fix missing column on invoices
-- Date: 2026-03-12

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_invoices_payment_tx ON invoices(payment_transaction_id);
