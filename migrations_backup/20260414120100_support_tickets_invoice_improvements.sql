-- ============================================================
-- Support Tickets + Invoice improvements
-- ============================================================

-- 1. Support Tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  subject         text NOT NULL,
  message         text NOT NULL,
  follow_up       text,
  category        text NOT NULL DEFAULT 'general', -- general | billing | technical | academic
  priority        text NOT NULL DEFAULT 'normal',  -- low | normal | high | urgent
  status          text NOT NULL DEFAULT 'open',    -- open | in_progress | resolved | reopened | closed
  invoice_id      uuid REFERENCES invoices(id) ON DELETE SET NULL,
  assigned_to     uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  admin_reply     text,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open','in_progress','resolved','reopened','closed')),
  CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT support_tickets_category_check CHECK (category IN ('general','billing','technical','academic','payment_proof'))
);

CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_invoice_id_idx ON support_tickets(invoice_id);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can see their own tickets; admins see all
CREATE POLICY "support_tickets_select" ON support_tickets
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin','teacher','school')
    )
  );

CREATE POLICY "support_tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "support_tickets_update" ON support_tickets
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM portal_users pu WHERE pu.id = auth.uid() AND pu.role IN ('admin','teacher','school')
    )
  );


-- 2. Invoice proof review fields (if not already present)
ALTER TABLE invoice_payment_proofs
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | request_more
  ADD COLUMN IF NOT EXISTS admin_note    text,
  ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;

ALTER TABLE invoice_payment_proofs
  DROP CONSTRAINT IF EXISTS invoice_payment_proofs_status_check;
ALTER TABLE invoice_payment_proofs
  ADD CONSTRAINT invoice_payment_proofs_status_check
  CHECK (status IN ('pending','approved','rejected','request_more'));


-- 3. Invoice reminder tracking columns
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reminder_1_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_3_sent_at  timestamptz;


-- 4. Student self-payment: ensure portal_user_id on payment_transactions is nullable and linked
-- (already nullable from schema — no change needed)

-- 5. Trigger: auto-update updated_at on support_tickets
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_updated_at ON support_tickets;
CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();
