-- Keep the database audit vocabulary aligned with the claim delivery workflow.
-- A failed email/WhatsApp attempt is not a successful code send and must remain
-- separately visible to operations staff.

alter table public.parent_claim_audit
  drop constraint if exists parent_claim_audit_action_check;

alter table public.parent_claim_audit
  add constraint parent_claim_audit_action_check
  check (action in (
    'code_sent',
    'code_delivery_failed',
    'otp_failed',
    'otp_verified',
    'completion_failed',
    'linked',
    'blocked',
    'unlinked'
  )) not valid;
