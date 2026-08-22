begin;

-- A destructive RPC must never be callable from a browser role, even when it
-- is SECURITY DEFINER. Only trusted server/database roles may reach it.
revoke all on function public.hard_delete_portal_user(uuid) from public, anon, authenticated;
revoke all on function public.hard_delete_school(uuid) from public, anon, authenticated;
grant execute on function public.hard_delete_portal_user(uuid) to service_role, postgres;

create or replace function public.school_protected_evidence(p_school uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_scores bigint := 0;
  v_cbt_attempts bigint := 0;
  v_progress_reports bigint := 0;
  v_term_grades bigint := 0;
  v_issued_invoices bigint := 0;
  v_payment_transactions bigint := 0;
  v_legacy_payments bigint := 0;
  v_receipts bigint := 0;
  v_consent_responses bigint := 0;
  v_policy text := 'flexible';
  v_immutable_total bigint := 0;
  v_policy_total bigint := 0;
begin
  if p_school is null then
    raise exception 'p_school is required';
  end if;

  select lower(coalesce(nullif(trim(setting.value), ''), 'flexible'))
  into v_policy
  from public.app_settings setting
  where setting.key = 'data_cleanup_policy'
  limit 1;
  v_policy := coalesce(v_policy, 'flexible');
  if v_policy not in ('flexible', 'standard', 'strict') then
    v_policy := 'flexible';
  end if;

  select count(*) into v_assignment_scores
  from public.assignment_submissions submission
  left join public.portal_users portal
    on portal.id = coalesce(submission.portal_user_id, submission.user_id)
  left join public.students student on student.id = submission.student_id
  where (portal.school_id = p_school or student.school_id = p_school)
    and (
      submission.grade is not null
      or submission.weighted_score is not null
      or submission.graded_at is not null
      or submission.graded_by is not null
      or lower(coalesce(submission.status, '')) = 'graded'
      or lower(coalesce(submission.grading_mode, '')) = 'manual'
    );

  select count(*) into v_cbt_attempts
  from public.cbt_sessions attempt
  join public.portal_users portal on portal.id = attempt.user_id
  where portal.school_id = p_school;

  select count(*) into v_progress_reports
  from public.student_progress_reports report
  left join public.portal_users learner on learner.id = report.student_id
  where (report.school_id = p_school or learner.school_id = p_school)
    and (
      coalesce(report.is_published, false)
      or report.overall_score is not null
      or report.participation_score is not null
      or report.attendance_score is not null
      or report.theory_score is not null
      or report.practical_score is not null
    );

  select count(*) into v_term_grades
  from public.enrollment_term_grades term_grade
  left join public.enrollments enrollment on enrollment.id = term_grade.enrollment_id
  left join public.portal_users learner on learner.id = enrollment.user_id
  where term_grade.school_id = p_school or learner.school_id = p_school;

  select count(*) into v_issued_invoices
  from public.invoices invoice
  where invoice.school_id = p_school
    and lower(coalesce(invoice.status, 'draft')) <> 'draft';

  select count(*) into v_payment_transactions
  from public.payment_transactions payment
  left join public.portal_users payer on payer.id = payment.portal_user_id
  where (payment.school_id = p_school or payer.school_id = p_school)
    and (
      payment.paid_at is not null
      or payment.external_transaction_id is not null
      or lower(coalesce(payment.payment_status, '')) in
        ('paid', 'success', 'successful', 'completed', 'refunded', 'partially_refunded')
    );

  select count(*) into v_legacy_payments
  from public.payments payment
  left join public.portal_users payer on payer.id = payment.user_id
  left join public.students student on student.id = payment.student_id
  where (payer.school_id = p_school or student.school_id = p_school)
    and (
      payment.payment_date is not null
      or payment.transaction_id is not null
      or payment.transaction_reference is not null
      or lower(coalesce(payment.payment_status, '')) in
        ('paid', 'success', 'successful', 'completed', 'refunded', 'partially_refunded')
    );

  select count(*) into v_receipts
  from public.receipts receipt
  left join public.portal_users learner on learner.id = receipt.student_id
  where receipt.school_id = p_school or learner.school_id = p_school;

  select count(*) into v_consent_responses
  from public.consent_responses response
  join public.consent_forms form on form.id = response.form_id
  where form.school_id = p_school;

  v_immutable_total := v_assignment_scores + v_cbt_attempts + v_progress_reports
    + v_term_grades + v_payment_transactions + v_legacy_payments + v_receipts;
  v_policy_total := case
    when v_policy in ('standard', 'strict') then v_issued_invoices + v_consent_responses
    else 0
  end;

  return jsonb_build_object(
    'policy', v_policy,
    'assignment_scores', v_assignment_scores,
    'cbt_attempts', v_cbt_attempts,
    'progress_reports', v_progress_reports,
    'term_grades', v_term_grades,
    'issued_invoices', v_issued_invoices,
    'payment_transactions', v_payment_transactions,
    'legacy_payments', v_legacy_payments,
    'receipts', v_receipts,
    'consent_responses', v_consent_responses,
    'immutable_total', v_immutable_total,
    'policy_total', v_policy_total,
    'total', v_immutable_total + v_policy_total
  );
end;
$$;

revoke all on function public.school_protected_evidence(uuid) from public, anon, authenticated;
grant execute on function public.school_protected_evidence(uuid) to service_role, postgres;

create or replace function public.hard_delete_school(p_school uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u record;
  users_removed int := 0;
  tables_swept int := 0;
  protected jsonb;
begin
  if p_school is null then
    raise exception 'p_school is required';
  end if;

  protected := public.school_protected_evidence(p_school);
  if coalesce((protected ->> 'total')::bigint, 0) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PROTECTED_RECORDS_PRESENT',
      detail = protected::text,
      hint = 'Archive the school or change the configurable cleanup policy for non-core evidence. Student/manual scores and posted finance evidence remain protected.';
  end if;

  for u in select id from public.portal_users where school_id = p_school loop
    perform public.hard_delete_portal_user(u.id);
    users_removed := users_removed + 1;
  end loop;

  set local session_replication_role = replica;
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
      and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'school_id'
  loop
    execute format('delete from public.%I where school_id = $1', r.table_name) using p_school;
    tables_swept := tables_swept + 1;
  end loop;
  set local session_replication_role = default;

  delete from public.schools where id = p_school;
  return jsonb_build_object('users_removed', users_removed, 'tables_swept', tables_swept);
end;
$$;

revoke all on function public.hard_delete_school(uuid) from public, anon, authenticated;
grant execute on function public.hard_delete_school(uuid) to service_role, postgres;

comment on function public.school_protected_evidence(uuid) is
  'Policy-driven school erasure preflight. Core academic scores and posted finance are always protected; issued documents and consent follow data_cleanup_policy.';
comment on function public.hard_delete_school(uuid) is
  'Service-only destructive cleanup for evidence-free test/noise schools. Real schools must be archived.';

commit;
