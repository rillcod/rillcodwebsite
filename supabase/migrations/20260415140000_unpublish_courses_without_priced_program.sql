-- Data hygiene: active courses must have a programme with price > 0 for Paystack checkout.
-- Unpublish (is_active = false) rows that would otherwise fail checkout or course saves.

update public.courses c
set
  is_active = false,
  updated_at = now()
where coalesce(c.is_active, true) = true
  and (
    c.program_id is null
    or not exists (
      select 1
      from public.programs p
      where p.id = c.program_id
        and p.price is not null
        and p.price > 0
    )
  );
