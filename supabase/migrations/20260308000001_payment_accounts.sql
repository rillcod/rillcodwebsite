-- =============================================
-- Payment Accounts — stores bank account details for
-- Rillcod Academy and partner schools
-- =============================================

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_type       text    NOT NULL DEFAULT 'school',  -- 'rillcod' | 'school'
  school_id        uuid    REFERENCES public.schools(id) ON DELETE CASCADE,
  label            text    NOT NULL,                   -- e.g. "Main Collection Account"
  bank_name        text    NOT NULL,
  account_number   text    NOT NULL,
  account_name     text    NOT NULL,
  account_type     text    NOT NULL DEFAULT 'savings', -- 'savings' | 'current'
  payment_note     text,                               -- instructions for payers
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid    REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_school ON public.payment_accounts(school_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_type   ON public.payment_accounts(owner_type);

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_payment_accounts" ON public.payment_accounts;
CREATE POLICY "admin_all_payment_accounts" ON public.payment_accounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role = 'admin'));

-- School: manage their own accounts
DROP POLICY IF EXISTS "school_manage_own_payment_accounts" ON public.payment_accounts;
CREATE POLICY "school_manage_own_payment_accounts" ON public.payment_accounts
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.portal_users WHERE id = auth.uid() AND role = 'school'
    )
  );

-- Teachers & students: read active Rillcod + their own school's accounts
DROP POLICY IF EXISTS "users_read_active_payment_accounts" ON public.payment_accounts;
CREATE POLICY "users_read_active_payment_accounts" ON public.payment_accounts
  FOR SELECT TO authenticated
  USING (
    is_active = true AND (
      owner_type = 'rillcod'
      OR school_id IN (
        SELECT school_id FROM public.portal_users WHERE id = auth.uid()
      )
    )
  );

GRANT ALL ON TABLE public.payment_accounts TO authenticated, service_role;
