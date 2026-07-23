/**
 * Sync incomplete / abandoned Paystack (and bank-pending) registrations into
 * customer_contact_book as external prospects — easy outreach + delete from Directory.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCrmEmail, normalizeCrmPhone } from '@/lib/crm/contact-book';
import { upsertBookAndCrmPipeline } from '@/lib/crm/upsert-book-crm';

type AnySupabase = SupabaseClient<any>;

export const DROPPED_PAYMENT_SOURCE = 'dropped_payment';

export type DroppedPaymentStatus =
  | 'paystack_pending'
  | 'abandoned'
  | 'failed'
  | 'partial'
  | 'pending_verification';

export type DroppedPayerSyncInput = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  schoolName?: string | null;
  className?: string | null;
  paymentStatus: DroppedPaymentStatus;
  paymentMethod?: string | null;
  programType: 'portal_registration' | 'special_program';
  childName?: string | null;
  childGrade?: string | null;
  program?: string | null;
  amountCharged?: number | null;
  balanceDue?: number | null;
  transactionReference?: string | null;
  prospectId?: string | null;
  studentId?: string | null;
  formSnapshot?: Record<string, unknown>;
};

export async function syncDroppedPayerToContactBook(
  sb: AnySupabase,
  input: DroppedPayerSyncInput,
): Promise<string | null> {
  const now = new Date().toISOString();
  const { bookId } = await upsertBookAndCrmPipeline(sb, {
    fullName: input.fullName,
    contactName: input.fullName,
    email: input.email,
    phone: input.phone,
    schoolName: input.schoolName,
    className: input.className,
    role: 'external',
    source: DROPPED_PAYMENT_SOURCE,
    lastChannel: input.paymentMethod || 'paystack_checkout',
    childEntry: input.childName
      ? {
          name: input.childName,
          grade: input.childGrade ?? null,
          program: input.program ?? null,
          school: input.schoolName ?? null,
        }
      : null,
    extraMeta: {
      is_dropped_payer: true,
      payment_status: input.paymentStatus,
      payment_method: input.paymentMethod ?? null,
      program_type: input.programType,
      prospect_id: input.prospectId ?? null,
      student_id: input.studentId ?? null,
      transaction_reference: input.transactionReference ?? null,
      amount_charged: input.amountCharged ?? null,
      balance_due: input.balanceDue ?? null,
      form_snapshot: input.formSnapshot ?? {},
      synced_at: now,
    },
  });

  return bookId;
}

function mapProspectStatus(status: string, txStatus?: string | null): DroppedPaymentStatus {
  if (status === 'partially_paid') return 'partial';
  if (status === 'pending_verification') return 'pending_verification';
  if (txStatus === 'failed') return 'failed';
  if (txStatus === 'pending') return 'paystack_pending';
  return 'abandoned';
}

async function latestTxForProspect(sb: AnySupabase, prospectId: string) {
  const { data } = await sb
    .from('payment_transactions')
    .select('payment_status, transaction_reference, payment_gateway_response, amount, payment_method')
    .contains('payment_gateway_response', { prospect_id: prospectId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function latestTxForStudent(sb: AnySupabase, studentId: string) {
  const { data } = await sb
    .from('payment_transactions')
    .select('payment_status, transaction_reference, payment_gateway_response, amount, payment_method')
    .or(`payment_gateway_response->>student_id.eq.${studentId},payment_gateway_response->>registration_id.eq.${studentId}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function syncDroppedPayerFromProspect(
  sb: AnySupabase,
  prospect: Record<string, unknown>,
): Promise<string | null> {
  const id = String(prospect.id ?? '');
  if (!id) return null;

  const tx = await latestTxForProspect(sb, id);
  const gw = (tx?.payment_gateway_response ?? {}) as Record<string, unknown>;
  const notesStr = String(prospect.notes ?? '');
  const studentPhoneMatch = notesStr.match(/\[Student Phone:\s*([^\]]+)\]/i);

  return syncDroppedPayerToContactBook(sb, {
    fullName: String(prospect.parent_name || prospect.full_name || 'Unknown'),
    email: (prospect.parent_email || prospect.email) as string | null,
    phone: (prospect.parent_phone || studentPhoneMatch?.[1]?.trim()) as string | null,
    schoolName: (prospect.school_name as string) || null,
    className: (prospect.grade as string) || null,
    paymentStatus: mapProspectStatus(String(prospect.status ?? 'unpaid'), tx?.payment_status),
    paymentMethod: tx?.payment_method ?? null,
    programType: 'special_program',
    childName: String(prospect.full_name ?? ''),
    childGrade: (prospect.grade as string) || null,
    program: String(prospect.course_interest ?? gw.program_title ?? ''),
    amountCharged: (gw.amount_charged as number) ?? tx?.amount ?? null,
    balanceDue: (gw.balance_due as number) ?? null,
    transactionReference: tx?.transaction_reference ?? null,
    prospectId: id,
    formSnapshot: {
      student_name: prospect.full_name,
      parent_name: prospect.parent_name,
      parent_email: prospect.parent_email,
      parent_phone: prospect.parent_phone,
      email: prospect.email,
      grade: prospect.grade,
      age: prospect.age,
      gender: prospect.gender,
      school_name: prospect.school_name,
      course_interest: prospect.course_interest,
      preferred_schedule: prospect.preferred_schedule,
      hear_about_us: prospect.hear_about_us,
      notes: prospect.notes,
      status: prospect.status,
      payment_plan: gw.payment_plan,
      preferred_mode: gw.preferred_mode,
      special_program_slug: gw.special_program_slug,
    },
  });
}

export async function syncDroppedPayerFromStudent(
  sb: AnySupabase,
  student: Record<string, unknown>,
): Promise<string | null> {
  const id = String(student.id ?? '');
  if (!id) return null;

  const tx = await latestTxForStudent(sb, id);
  const gw = (tx?.payment_gateway_response ?? {}) as Record<string, unknown>;

  return syncDroppedPayerToContactBook(sb, {
    fullName: String(student.parent_name || student.full_name || 'Unknown'),
    email: (student.parent_email as string) || null,
    phone: (student.parent_phone as string) || null,
    schoolName: (student.school_name as string) || null,
    className: (student.grade_level as string) || (student.section_class as string) || null,
    paymentStatus: mapProspectStatus('unpaid', tx?.payment_status),
    paymentMethod: tx?.payment_method ?? 'paystack',
    programType: 'portal_registration',
    childName: String(student.full_name ?? ''),
    childGrade: (student.grade_level as string) || null,
    program: String(student.course_interest ?? gw.enrollment_type ?? ''),
    amountCharged: tx?.amount ?? (gw.amount_charged as number) ?? null,
    balanceDue: (gw.balance_due as number) ?? null,
    transactionReference: tx?.transaction_reference ?? null,
    studentId: id,
    formSnapshot: {
      student_name: student.full_name,
      parent_name: student.parent_name,
      parent_email: student.parent_email,
      parent_phone: student.parent_phone,
      enrollment_type: student.enrollment_type,
      course_interest: student.course_interest,
      preferred_schedule: student.preferred_schedule,
      school_name: student.school_name,
      grade_level: student.grade_level,
      section_class: student.section_class,
      city: student.city,
      state: student.state,
      status: student.status,
      payment_plan: gw.payment_plan,
    },
  });
}

export async function backfillDroppedPayers(sb: AnySupabase): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  const { data: prospects } = await sb
    .from('prospective_students')
    .select('*')
    .in('status', ['unpaid', 'pending_verification', 'partially_paid'])
    .eq('is_deleted', false)
    .limit(500);

  for (const p of prospects ?? []) {
    try {
      const id = await syncDroppedPayerFromProspect(sb, p as Record<string, unknown>);
      if (id) synced++;
      else skipped++;
    } catch (e: any) {
      errors.push(`prospect ${p.id}: ${e?.message || 'sync failed'}`);
    }
  }

  const { data: students } = await sb
    .from('students')
    .select('*')
    .eq('status', 'pending')
    .is('registration_payment_at', null)
    .limit(500);

  for (const s of students ?? []) {
    try {
      const email = normalizeCrmEmail(s.parent_email as string);
      const phone = normalizeCrmPhone(s.parent_phone as string);
      if (!email && !phone) {
        skipped++;
        continue;
      }
      const id = await syncDroppedPayerFromStudent(sb, s as Record<string, unknown>);
      if (id) synced++;
      else skipped++;
    } catch (e: any) {
      errors.push(`student ${s.id}: ${e?.message || 'sync failed'}`);
    }
  }

  return { synced, skipped, errors };
}

/** True when contact book already holds this dropped payer (skip integrity purge). */
export async function hasDroppedPayerBookEntry(
  sb: AnySupabase,
  opts: { prospectId?: string; studentId?: string; email?: string | null; phone?: string | null },
): Promise<boolean> {
  const email = normalizeCrmEmail(opts.email);
  const phone = normalizeCrmPhone(opts.phone);

  if (opts.prospectId) {
    const { data } = await sb
      .from('customer_contact_book')
      .select('id')
      .eq('source', DROPPED_PAYMENT_SOURCE)
      .contains('metadata', { prospect_id: opts.prospectId })
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
  }
  if (opts.studentId) {
    const { data } = await sb
      .from('customer_contact_book')
      .select('id')
      .eq('source', DROPPED_PAYMENT_SOURCE)
      .contains('metadata', { student_id: opts.studentId })
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
  }
  if (email) {
    const { data } = await sb.from('customer_contact_book').select('id').eq('email', email).eq('source', DROPPED_PAYMENT_SOURCE).maybeSingle();
    if (data?.id) return true;
  }
  if (phone) {
    const { data } = await sb.from('customer_contact_book').select('id').eq('phone', phone).eq('source', DROPPED_PAYMENT_SOURCE).maybeSingle();
    if (data?.id) return true;
  }
  return false;
}
