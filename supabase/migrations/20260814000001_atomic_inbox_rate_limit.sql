-- Atomically consume one inbox message allowance for a sender/day bucket.
create or replace function public.consume_communication_rate_limit(
  p_sender_id uuid,
  p_sender_role text,
  p_day_bucket timestamptz
)
returns table(daily_count integer, last_message_at timestamptz)
language sql
security definer
set search_path = public
as $$
  insert into public.communication_rate_limits (
    sender_id, sender_role, day_bucket, daily_count, last_message_at, updated_at
  ) values (
    p_sender_id, p_sender_role, p_day_bucket, 1, now(), now()
  )
  on conflict (sender_id, day_bucket) do update
    set daily_count = public.communication_rate_limits.daily_count + 1,
        last_message_at = now(),
        updated_at = now(),
        sender_role = excluded.sender_role
  returning communication_rate_limits.daily_count, communication_rate_limits.last_message_at;
$$;

revoke all on function public.consume_communication_rate_limit(uuid, text, timestamptz) from public;
grant execute on function public.consume_communication_rate_limit(uuid, text, timestamptz) to service_role;
-- Serialize parent/student conversation creation without relying on a fragile
-- application-level check-then-insert sequence.
create or replace function public.get_or_create_inbox_conversation(
  p_portal_user_id uuid,
  p_contact_name text,
  p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.whatsapp_conversations%rowtype;
  v_created boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_portal_user_id::text, 0));
  select * into v_conversation
  from public.whatsapp_conversations
  where portal_user_id = p_portal_user_id
  order by created_at asc
  limit 1;

  if v_conversation.id is null then
    insert into public.whatsapp_conversations (
      portal_user_id, contact_name, phone_number, last_message_at,
      last_message_preview, unread_count
    ) values (
      p_portal_user_id, left(coalesce(nullif(trim(p_contact_name), ''), 'User'), 100),
      nullif(regexp_replace(coalesce(p_phone_number, ''), '\D', '', 'g'), ''),
      now(), 'Conversation started', 0
    ) returning * into v_conversation;
    v_created := true;
  end if;

  return jsonb_build_object('conversation', to_jsonb(v_conversation), 'created', v_created);
end;
$$;

revoke all on function public.get_or_create_inbox_conversation(uuid, text, text) from public;
grant execute on function public.get_or_create_inbox_conversation(uuid, text, text) to service_role;