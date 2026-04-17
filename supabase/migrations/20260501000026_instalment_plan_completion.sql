-- migration: auto-complete instalment plans when all items are paid
-- fixes issue where plans stay "active" forever even after full payment

-- function to check if all items in a plan are paid
create or replace function check_instalment_plan_completion()
returns trigger
language plpgsql
security definer
as $$
declare
  v_pending_count int;
begin
  -- count how many items in this plan are not yet paid
  select count(*)
    into v_pending_count
    from public.instalment_items
   where plan_id = NEW.plan_id
     and status != 'paid';

  -- if all items are paid, mark the plan as completed
  if v_pending_count = 0 then
    update public.instalment_plans
       set status = 'completed',
           updated_at = now()
     where id = NEW.plan_id
       and status = 'active';  -- only update if currently active
  end if;

  return NEW;
end;
$$;

-- trigger fires after any instalment_item is updated to 'paid'
drop trigger if exists instalment_item_paid_trigger on public.instalment_items;

create trigger instalment_item_paid_trigger
  after update on public.instalment_items
  for each row
  when (NEW.status = 'paid' and OLD.status != 'paid')
  execute function check_instalment_plan_completion();

-- also check on insert (in case items are created as already paid)
drop trigger if exists instalment_item_insert_trigger on public.instalment_items;

create trigger instalment_item_insert_trigger
  after insert on public.instalment_items
  for each row
  when (NEW.status = 'paid')
  execute function check_instalment_plan_completion();
