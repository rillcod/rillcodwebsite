-- ─────────────────────────────────────────────────────────────────────────────
-- parent_claim_audit
-- Accountability log for the self-service parent claim: who requested a code, who got
-- linked (and to which child + how many siblings), and blocked hijack attempts. No FK
-- constraints so the trail survives even if a record is later removed. Service-role
-- writes; staff read.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_claim_audit (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid,       -- portal_users.id of the scanned child
  parent_id        uuid,       -- portal_users.id of the parent (null when blocked)
  email            text,
  phone            text,
  action           text        NOT NULL,   -- 'code_sent' | 'linked' | 'blocked'
  siblings_linked  integer     NOT NULL DEFAULT 0,
  ip               text,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_student ON public.parent_claim_audit (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_created ON public.parent_claim_audit (created_at DESC);

ALTER TABLE public.parent_claim_audit ENABLE ROW LEVEL SECURITY;

-- Staff (admin / teacher / school) may read the audit trail.
DROP POLICY IF EXISTS "staff_read_parent_claim_audit" ON public.parent_claim_audit;
CREATE POLICY "staff_read_parent_claim_audit" ON public.parent_claim_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE portal_users.id = auth.uid()
        AND portal_users.role IN ('admin', 'teacher', 'school')
    )
  );
