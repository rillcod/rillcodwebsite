drop policy "Teachers can manage CBT exams" on "public"."cbt_exams";

drop policy "Allow public insert" on "public"."prospective_students";


  create table "public"."announcement_reads" (
    "portal_user_id" uuid not null,
    "announcement_id" uuid not null,
    "read_at" timestamp with time zone not null default now()
      );


alter table "public"."announcement_reads" enable row level security;


  create table "public"."invoice_payment_proofs" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_id" uuid not null,
    "submitted_by" uuid not null,
    "proof_image_url" text not null,
    "payer_note" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."invoice_payment_proofs" enable row level security;

alter table "public"."portal_users" add column "metadata" jsonb;

alter table "public"."project_group_members" add column "task_description" text;

alter table "public"."report_settings" alter column "org_email" set default 'rillcod@gmail.com'::text;

alter table "public"."students" add column "registration_payment_at" timestamp with time zone;

alter table "public"."students" add column "registration_paystack_reference" text;

CREATE UNIQUE INDEX announcement_reads_pkey ON public.announcement_reads USING btree (portal_user_id, announcement_id);

CREATE INDEX idx_announcement_reads_announcement_id ON public.announcement_reads USING btree (announcement_id);

CREATE INDEX idx_assignment_lesson_id ON public.assignments USING btree (lesson_id);

CREATE INDEX idx_invoice_payment_proofs_invoice_id ON public.invoice_payment_proofs USING btree (invoice_id);

CREATE INDEX idx_invoice_payment_proofs_submitted_by ON public.invoice_payment_proofs USING btree (submitted_by);

CREATE UNIQUE INDEX invoice_payment_proofs_pkey ON public.invoice_payment_proofs USING btree (id);

alter table "public"."announcement_reads" add constraint "announcement_reads_pkey" PRIMARY KEY using index "announcement_reads_pkey";

alter table "public"."invoice_payment_proofs" add constraint "invoice_payment_proofs_pkey" PRIMARY KEY using index "invoice_payment_proofs_pkey";

alter table "public"."announcement_reads" add constraint "announcement_reads_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE not valid;

alter table "public"."announcement_reads" validate constraint "announcement_reads_announcement_id_fkey";

alter table "public"."announcement_reads" add constraint "announcement_reads_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE not valid;

alter table "public"."announcement_reads" validate constraint "announcement_reads_portal_user_id_fkey";

alter table "public"."invoice_payment_proofs" add constraint "invoice_payment_proofs_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE not valid;

alter table "public"."invoice_payment_proofs" validate constraint "invoice_payment_proofs_invoice_id_fkey";

alter table "public"."invoice_payment_proofs" add constraint "invoice_payment_proofs_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES public.portal_users(id) ON DELETE CASCADE not valid;

alter table "public"."invoice_payment_proofs" validate constraint "invoice_payment_proofs_submitted_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    year_prefix TEXT;
    seq_val INT;
BEGIN
    year_prefix := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-';
    SELECT count(*) + 1 INTO seq_val FROM invoices WHERE invoice_number LIKE year_prefix || '%';
    NEW.invoice_number := year_prefix || LPAD(seq_val::text, 5, '0');
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    year_prefix TEXT;
    seq_val INT;
BEGIN
    year_prefix := 'RCP-' || TO_CHAR(NOW(), 'YYYY') || '-';
    SELECT count(*) + 1 INTO seq_val FROM receipts WHERE receipt_number LIKE year_prefix || '%';
    NEW.receipt_number := year_prefix || LPAD(seq_val::text, 6, '0');
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.portal_users WHERE id = auth.uid();
  RETURN v_role;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_school_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT school_id FROM public.portal_users WHERE id = auth.uid());
END; $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.portal_users (
    id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)   -- fallback: use email prefix as name
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- admin-created rows already have full data

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT role = 'admin' FROM public.portal_users WHERE id = auth.uid());
END; $function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher', 'school') FROM public.portal_users WHERE id = auth.uid());
END; $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_live_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."announcement_reads" to "anon";

grant insert on table "public"."announcement_reads" to "anon";

grant references on table "public"."announcement_reads" to "anon";

grant select on table "public"."announcement_reads" to "anon";

grant trigger on table "public"."announcement_reads" to "anon";

grant truncate on table "public"."announcement_reads" to "anon";

grant update on table "public"."announcement_reads" to "anon";

grant delete on table "public"."announcement_reads" to "authenticated";

grant insert on table "public"."announcement_reads" to "authenticated";

grant references on table "public"."announcement_reads" to "authenticated";

grant select on table "public"."announcement_reads" to "authenticated";

grant trigger on table "public"."announcement_reads" to "authenticated";

grant truncate on table "public"."announcement_reads" to "authenticated";

grant update on table "public"."announcement_reads" to "authenticated";

grant delete on table "public"."announcement_reads" to "service_role";

grant insert on table "public"."announcement_reads" to "service_role";

grant references on table "public"."announcement_reads" to "service_role";

grant select on table "public"."announcement_reads" to "service_role";

grant trigger on table "public"."announcement_reads" to "service_role";

grant truncate on table "public"."announcement_reads" to "service_role";

grant update on table "public"."announcement_reads" to "service_role";

grant delete on table "public"."invoice_payment_proofs" to "anon";

grant insert on table "public"."invoice_payment_proofs" to "anon";

grant references on table "public"."invoice_payment_proofs" to "anon";

grant select on table "public"."invoice_payment_proofs" to "anon";

grant trigger on table "public"."invoice_payment_proofs" to "anon";

grant truncate on table "public"."invoice_payment_proofs" to "anon";

grant update on table "public"."invoice_payment_proofs" to "anon";

grant delete on table "public"."invoice_payment_proofs" to "authenticated";

grant insert on table "public"."invoice_payment_proofs" to "authenticated";

grant references on table "public"."invoice_payment_proofs" to "authenticated";

grant select on table "public"."invoice_payment_proofs" to "authenticated";

grant trigger on table "public"."invoice_payment_proofs" to "authenticated";

grant truncate on table "public"."invoice_payment_proofs" to "authenticated";

grant update on table "public"."invoice_payment_proofs" to "authenticated";

grant delete on table "public"."invoice_payment_proofs" to "service_role";

grant insert on table "public"."invoice_payment_proofs" to "service_role";

grant references on table "public"."invoice_payment_proofs" to "service_role";

grant select on table "public"."invoice_payment_proofs" to "service_role";

grant trigger on table "public"."invoice_payment_proofs" to "service_role";

grant truncate on table "public"."invoice_payment_proofs" to "service_role";

grant update on table "public"."invoice_payment_proofs" to "service_role";


  create policy "announcement_reads_insert_own"
  on "public"."announcement_reads"
  as permissive
  for insert
  to authenticated
with check ((portal_user_id = auth.uid()));



  create policy "announcement_reads_select_own"
  on "public"."announcement_reads"
  as permissive
  for select
  to authenticated
using ((portal_user_id = auth.uid()));



  create policy "announcement_reads_update_own"
  on "public"."announcement_reads"
  as permissive
  for update
  to authenticated
using ((portal_user_id = auth.uid()))
with check ((portal_user_id = auth.uid()));



  create policy "invoice_payment_proofs_insert_by_payer"
  on "public"."invoice_payment_proofs"
  as permissive
  for insert
  to authenticated
with check (((submitted_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_payment_proofs.invoice_id) AND ((i.portal_user_id = auth.uid()) OR (public.is_parent() AND (i.portal_user_id IN ( SELECT public.get_parent_child_user_ids() AS get_parent_child_user_ids)))))))));



  create policy "invoice_payment_proofs_select_admin"
  on "public"."invoice_payment_proofs"
  as permissive
  for select
  to authenticated
using (public.is_admin());



  create policy "invoice_payment_proofs_select_own"
  on "public"."invoice_payment_proofs"
  as permissive
  for select
  to authenticated
using ((submitted_by = auth.uid()));



  create policy "invoice_payment_proofs_select_school_staff"
  on "public"."invoice_payment_proofs"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.invoices inv
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((inv.id = invoice_payment_proofs.invoice_id) AND (inv.school_id IS NOT NULL) AND (pu.school_id = inv.school_id) AND (pu.role = ANY (ARRAY['school'::text, 'teacher'::text]))))));



  create policy "payment_transactions_select_finance_staff"
  on "public"."payment_transactions"
  as permissive
  for select
  to authenticated
using ((public.is_admin() OR ((public.get_my_role() = 'school'::text) AND (public.get_my_school_id() IS NOT NULL) AND (school_id IS NOT NULL) AND (school_id = public.get_my_school_id()))));



  create policy "payment_transactions_update_finance_staff"
  on "public"."payment_transactions"
  as permissive
  for update
  to authenticated
using ((public.is_admin() OR ((public.get_my_role() = 'school'::text) AND (public.get_my_school_id() IS NOT NULL) AND (school_id IS NOT NULL) AND (school_id = public.get_my_school_id()))))
with check ((public.is_admin() OR ((public.get_my_role() = 'school'::text) AND (public.get_my_school_id() IS NOT NULL) AND (school_id IS NOT NULL) AND (school_id = public.get_my_school_id()))));



  create policy "Teachers can manage CBT exams"
  on "public"."cbt_exams"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'teacher'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'teacher'::text)))));



  create policy "Allow public insert"
  on "public"."prospective_students"
  as permissive
  for insert
  to anon, authenticated
with check (true);



