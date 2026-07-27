-- Parent-student link provenance.
--
-- Why: the origin of a family link was only reconstructable by inference — the
-- oldest links have no audit row at all, and `source` on the audit trail defaults
-- to the function name for every call site that passes no options, so a link created
-- by a staff member, by the consent portal flow, and by an anonymous result-check
-- backfill were indistinguishable after the fact.
--
-- These columns make the answer a property of the link itself:
--   created_by           — the staff/parent account that caused the link (NULL = system/cron)
--   source               — which code path wrote it (e.g. 'parent-claim.provision')
--   verified_by_parent_at — set ONLY when the parent themselves proved possession of
--                          the account (self-service claim, or a signed-in parent whose
--                          own email/phone matched the student record). Staff asserting
--                          a relationship is NOT parent verification.
--
-- Safe to re-run.

ALTER TABLE public.parent_student_links
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS verified_by_parent_at timestamptz;

-- Deliberately NOT a foreign key: the actor may later be deleted, and losing the
-- provenance of a safeguarding-relevant link to a cascade would defeat the purpose.
COMMENT ON COLUMN public.parent_student_links.created_by IS
  'portal_users.id of whoever caused this link. NULL = system/cron. Not an FK: provenance must survive account deletion.';
COMMENT ON COLUMN public.parent_student_links.source IS
  'Code path that created the link, e.g. parent-claim.provision, consent.attachParent.siblings, parents.manage.PATCH.';
COMMENT ON COLUMN public.parent_student_links.verified_by_parent_at IS
  'Set only when the parent proved possession of their own account. NULL = asserted by staff or inferred by the system.';

CREATE INDEX IF NOT EXISTS idx_psl_source ON public.parent_student_links USING btree (source);
CREATE INDEX IF NOT EXISTS idx_psl_verified_by_parent_at ON public.parent_student_links USING btree (verified_by_parent_at);

-- Backfill what the existing audit trail can prove, and nothing more.
--
-- 1. Self-service claims: parent_claim_audit is written ONLY by completeParentClaim,
--    so a row there is proof the parent verified themselves.
UPDATE public.parent_student_links psl
SET    verified_by_parent_at = COALESCE(psl.verified_by_parent_at, pca.created_at),
       source                = COALESCE(psl.source, 'parent-claim.backfilled')
FROM   public.students s
JOIN   public.parent_claim_audit pca
       ON pca.action = 'linked'
      AND pca.student_id IN (s.id, s.user_id)
WHERE  psl.student_id = s.id
  AND  pca.parent_id = psl.parent_id;

-- 2. Everything else: take source/actor from the link audit row when one exists.
--    Left deliberately NULL where the trail is silent, rather than guessing.
UPDATE public.parent_student_links psl
SET    source     = COALESCE(psl.source, al.new_values ->> 'source'),
       created_by = COALESCE(psl.created_by, al.actor_id)
FROM   public.audit_logs al
WHERE  al.action = 'parent_student_linked'
  AND  al.record_id = psl.student_id
  AND  (al.new_values ->> 'parent_id') = psl.parent_id::text;
