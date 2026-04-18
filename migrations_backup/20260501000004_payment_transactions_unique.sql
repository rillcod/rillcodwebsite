-- Migration: payment_transactions.transaction_reference unique constraint
-- Requirements: Req 6.2

-- Req 6.2: Enforce uniqueness on transaction_reference at the database level
--          to prevent duplicate payment records for the same Paystack reference.
ALTER TABLE payment_transactions
  ADD CONSTRAINT uq_payment_transactions_reference
    UNIQUE (transaction_reference);
