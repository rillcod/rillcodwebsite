-- The platform spine is a central academic source. Staff may consume it, but
-- only the Academic Office can create, revise, or remove template rows.

drop policy if exists "staff read platform syllabus template" on public.platform_syllabus_week_template;
create policy platform_spine_staff_read
on public.platform_syllabus_week_template for select to authenticated
using (public.is_staff());

create policy platform_spine_admin_manage
on public.platform_syllabus_week_template for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.platform_syllabus_week_template from anon;
revoke all on public.platform_syllabus_week_template from authenticated;
grant select, insert, update, delete on public.platform_syllabus_week_template to authenticated;
grant all on public.platform_syllabus_week_template to service_role;

comment on table public.platform_syllabus_week_template is
  'Central Academic Office learning-sequence source. Technical lane and catalog fields are internal and are not configured in teacher workflows.';

