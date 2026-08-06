-- Tell a superseded payment attempt apart from a real failure.
--
-- Three code paths retire an unfinished attempt by writing payment_status =
-- 'failed' with no marker: the balance route, the summer-school route and the
-- registration route. A fourth, voidPaymentAttempt, writes the same status but
-- does stamp reconciliation_voided. The result is one bucket holding three
-- different things:
--
--   * an attempt retired because the parent started a newer one
--   * an attempt an admin deliberately voided
--   * an attempt that genuinely failed or was abandoned at the gateway
--
-- 33 rows sit in that bucket today, and no report can separate them, so
-- "82% of payments failed" is both what the data says and not true. Finance
-- cannot be reconciled from a status that means three things.
--
-- The merge has to happen in the database: PostgREST cannot merge JSONB per row
-- in a bulk update, so doing this from the client meant read-then-write per row
-- and a race with the very attempt that triggered the supersede.

create or replace function public.supersede_pending_payment_attempts(
  p_match jsonb,
  p_replaced_by text default null,
  p_reason text default 'replaced_by_newer_attempt'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_now timestamptz := now();
begin
  if p_match is null or p_match = '{}'::jsonb then
    raise exception 'supersede_pending_payment_attempts: a match filter is required';
  end if;

  update public.payment_transactions t
     set payment_status = 'failed',
         updated_at = v_now,
         payment_gateway_response =
           coalesce(t.payment_gateway_response, '{}'::jsonb)
           || jsonb_build_object(
                'superseded_at', to_jsonb(v_now),
                'superseded_reason', to_jsonb(p_reason),
                'superseded_by_reference', to_jsonb(p_replaced_by)
              )
   where t.payment_status = 'pending'
     and coalesce(t.payment_gateway_response, '{}'::jsonb) @> p_match;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.supersede_pending_payment_attempts(jsonb, text, text) from public;
grant execute on function public.supersede_pending_payment_attempts(jsonb, text, text) to service_role;

comment on function public.supersede_pending_payment_attempts(jsonb, text, text) is
  'Retires unfinished payment attempts matching a gateway-metadata filter, stamping why. Lets reporting separate a superseded attempt from an admin void (reconciliation_voided) and from a genuine gateway failure, which all previously shared payment_status = failed.';

-- Backfill what can still be established. An attempt is only marked superseded
-- where a LATER attempt exists for the same prospect: that is the condition the
-- routes were testing for. Anything else keeps its plain 'failed' status rather
-- than being relabelled on a guess — a wrong label here is worse than none.
update public.payment_transactions t
   set payment_gateway_response =
         coalesce(t.payment_gateway_response, '{}'::jsonb)
         || jsonb_build_object(
              'superseded_at', to_jsonb(t.updated_at),
              'superseded_reason', to_jsonb('backfilled_later_attempt_exists'::text)
            )
 where t.payment_status = 'failed'
   and not (coalesce(t.payment_gateway_response, '{}'::jsonb) ? 'superseded_at')
   and not (coalesce(t.payment_gateway_response, '{}'::jsonb) ? 'reconciliation_voided')
   and t.payment_gateway_response->>'prospect_id' is not null
   and exists (
     select 1 from public.payment_transactions later
      where later.id <> t.id
        and later.created_at > t.created_at
        and later.payment_gateway_response->>'prospect_id'
            = t.payment_gateway_response->>'prospect_id'
   );
