-- Make governance promises true at the database boundary: published editions do
-- not mutate, proposal authors cannot approve themselves, and staff read only
-- editions assigned to their school scope.

create or replace function public.protect_published_curriculum_release()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.course_id is distinct from new.course_id
     or old.source_curriculum_id is distinct from new.source_curriculum_id
     or old.release_number is distinct from new.release_number
     or old.title is distinct from new.title
     or old.change_summary is distinct from new.change_summary
     or old.content is distinct from new.content
     or old.content_hash is distinct from new.content_hash
     or old.source_metadata is distinct from new.source_metadata
     or old.published_by is distinct from new.published_by
     or old.published_at is distinct from new.published_at
     or old.academic_session is distinct from new.academic_session
     or old.effective_term_number is distinct from new.effective_term_number
     or old.grade_key is distinct from new.grade_key
     or old.audience_label is distinct from new.audience_label then
    raise exception using
      errcode = '55000',
      message = 'An official curriculum edition cannot be changed after publication.',
      hint = 'Improve the central draft and publish a new edition. Existing class plans will remain protected.';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception using
      errcode = '55000',
      message = 'A retired curriculum edition cannot be republished in place.',
      hint = 'Publish a new official edition instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_published_curriculum_release on public.academic_curriculum_releases;
create trigger protect_published_curriculum_release
before update on public.academic_curriculum_releases
for each row execute function public.protect_published_curriculum_release();

drop policy if exists academic_releases_staff_read on public.academic_curriculum_releases;
create policy academic_releases_assigned_read
on public.academic_curriculum_releases for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.academic_curriculum_adoptions adoption
    join public.portal_users actor on actor.id = auth.uid()
    where adoption.release_id = academic_curriculum_releases.id
      and adoption.status = 'active'
      and (
        (actor.role in ('school', 'school_admin') and actor.school_id = adoption.school_id)
        or (
          actor.role = 'teacher'
          and exists (
            select 1 from public.teacher_schools assignment
            where assignment.teacher_id = actor.id
              and assignment.school_id = adoption.school_id
          )
        )
      )
  )
);

create or replace function public.protect_academic_proposal_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if auth.uid() is null then return new; end if;
  select role into v_actor_role from public.portal_users where id = auth.uid();
  if coalesce(v_actor_role, '') = 'admin' then return new; end if;

  if tg_op = 'INSERT' then
    new.proposed_by := auth.uid();
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if old.proposed_by <> auth.uid() then
    raise exception using errcode = '42501', message = 'You can only manage your own academic suggestions.';
  end if;
  if new.status <> 'withdrawn' then
    raise exception using
      errcode = '42501',
      message = 'Only the Academic Office can approve or reject an academic suggestion.';
  end if;
  if old.curriculum_id is distinct from new.curriculum_id
     or old.release_id is distinct from new.release_id
     or old.school_id is distinct from new.school_id
     or old.class_id is distinct from new.class_id
     or old.course_id is distinct from new.course_id
     or old.proposed_by is distinct from new.proposed_by
     or old.requested_scope is distinct from new.requested_scope
     or old.title is distinct from new.title
     or old.rationale is distinct from new.rationale
     or old.changed_paths is distinct from new.changed_paths
     or old.proposal_data is distinct from new.proposal_data
     or old.policy_classification is distinct from new.policy_classification
     or new.reviewed_by is not null
     or new.reviewed_at is not null
     or new.review_note is not null then
    raise exception using
      errcode = '42501',
      message = 'Submitted academic suggestions cannot be rewritten.',
      hint = 'Withdraw this suggestion and submit a clearer one.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_academic_proposal_review on public.academic_curriculum_proposals;
create trigger protect_academic_proposal_review
before insert or update on public.academic_curriculum_proposals
for each row execute function public.protect_academic_proposal_review();

