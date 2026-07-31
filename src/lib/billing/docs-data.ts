import { billingDocsDb } from '@/lib/billing/docs-auth';
import { deriveSchoolPricingFromInvoice } from '@/lib/billing/derive-school-pricing';

export type BillingDocsStudent = {
  id: string;
  full_name: string;
  section_class: string | null;
  /** Academic class level (e.g. Basic 5, JSS 1) — portal_users.grade */
  grade: string | null;
  email: string | null;
};

export type BillingDocsInvoice = {
  portal_user_id: string | null;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
};

export type BillingDocsReceipt = {
  id: string;
  receipt_number: string;
  amount: number;
  issued_at: string;
  /** Canonical FK on receipts — portal student id */
  student_id: string | null;
  /** Alias of student_id for payment-register maps keyed by portal user */
  portal_user_id: string | null;
  metadata?: { payment_method?: string } | null;
};

export type BillingDocsAttendanceStudent = {
  student_id: string;
  full_name: string;
  section_class: string;
  grade: string;
  sessions: string[];
};

export type LinkedSchoolInvoice = {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date?: string | null;
  payment_link?: string | null;
  items: Array<{ description?: string; quantity?: number; unit_price?: number; total?: number }>;
  metadata?: {
    term_label?: string;
    academic_year?: number;
    term_number?: number;
    payment_method?: string;
    commission_rate?: number;
    pay_to_account_id?: string;
  } | null;
};

export type BillingDocsSchool = {
  id: string;
  name: string;
  rillcod_quota_percent?: number | null;
  commission_rate?: number | null;
};

/** Payment-register payload: active students + per-student invoices/receipts. */
export async function loadPaymentRegisterData(schoolId: string) {
  const db = billingDocsDb();
  const [stuRes, invRes, recRes] = await Promise.all([
    db
      .from('portal_users')
      .select('id, full_name, section_class, grade, email')
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('full_name'),
    db
      .from('invoices')
      .select('portal_user_id, amount, currency, status, due_date')
      .eq('school_id', schoolId)
      .not('portal_user_id', 'is', null),
    db
      .from('receipts')
      .select('id, receipt_number, amount, issued_at, student_id, metadata')
      .eq('school_id', schoolId),
  ]);

  if (stuRes.error) throw new Error(stuRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);
  if (recRes.error) throw new Error(recRes.error.message);

  return {
    students: (stuRes.data ?? []) as BillingDocsStudent[],
    invoices: ((invRes.data ?? []) as any[]).map((i) => ({
      ...i,
      currency: i.currency ?? 'NGN',
      amount: Number(i.amount) || 0,
    })) as BillingDocsInvoice[],
    receipts: ((recRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      receipt_number: r.receipt_number,
      amount: Number(r.amount) || 0,
      issued_at: r.issued_at,
      student_id: r.student_id ?? null,
      portal_user_id: r.student_id ?? null,
      metadata: r.metadata ?? null,
    })) as BillingDocsReceipt[],
  };
}

/** Attendance roster payload scoped to one school + date window. */
export async function loadAttendanceRosterData(schoolId: string, dateFrom: string, dateTo: string) {
  const db = billingDocsDb();
  // attendance.student_id → students(id); attendance.user_id → portal_users(id).
  // Live data is keyed on user_id (portal). Hint the FK or PostgREST cannot resolve the join.
  const { data, error } = await db
    .from('attendance')
    .select(`
      user_id, status,
      class_sessions!attendance_session_id_fkey(session_date, classes!class_sessions_class_id_fkey(name, school_id)),
      portal_users!attendance_user_id_fkey(full_name, section_class, grade, school_id)
    `)
    .eq('status', 'present')
    .not('user_id', 'is', null)
    .eq('class_sessions.classes.school_id', schoolId)
    .gte('class_sessions.session_date', dateFrom)
    .lte('class_sessions.session_date', dateTo);

  if (error) throw new Error(error.message);

  const byStudent: Record<string, BillingDocsAttendanceStudent> = {};
  for (const row of (data ?? []) as any[]) {
    const uid = row.user_id as string | null;
    if (!uid || !row.portal_users || !row.class_sessions) continue;
    if (row.portal_users.school_id && row.portal_users.school_id !== schoolId) continue;
    if (!byStudent[uid]) {
      byStudent[uid] = {
        student_id: uid,
        full_name: row.portal_users.full_name ?? '—',
        section_class: row.portal_users.section_class ?? '—',
        grade: row.portal_users.grade ?? '—',
        sessions: [],
      };
    }
    const d = row.class_sessions?.session_date;
    if (d && !byStudent[uid].sessions.includes(d)) byStudent[uid].sessions.push(d);
  }

  return Object.values(byStudent).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function loadLinkedSchoolInvoice(schoolId: string, academicYear: string, termNumber: string) {
  const {
    invoiceMatchesAcademicPeriod,
    isActiveInvoice,
    isSchoolStreamInvoice,
    reportPeriodFromFinanceKeys,
  } = await import('@/lib/school-reports/invoice-match');
  const db = billingDocsDb();
  const period = reportPeriodFromFinanceKeys(academicYear, termNumber);
  const { data, error } = await db
    .from('invoices')
    .select(
      'id, invoice_number, amount, currency, status, due_date, payment_link, items, metadata, stream, portal_user_id, school_id, billing_cycles!invoices_billing_cycle_id_fkey(term_label,term_start_date)',
    )
    .eq('school_id', schoolId)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const match = (data ?? [])
    .filter(isSchoolStreamInvoice)
    .filter(isActiveInvoice)
    .find((row) => invoiceMatchesAcademicPeriod(row, period));
  return (match as LinkedSchoolInvoice | null) ?? null;
}

export async function loadBillingDocsBootstrap() {
  const db = billingDocsDb();
  const [schoolsRes, banksRes, overdueRes] = await Promise.all([
    db
      .from('schools')
      .select('id, name, rillcod_quota_percent, commission_rate')
      .order('name'),
    db
      .from('payment_accounts')
      .select('*')
      .eq('is_active', true)
      .is('school_id', null)
      .order('created_at', { ascending: false }),
    db
      .from('invoices')
      .select('id, invoice_number, amount, currency, due_date, school_id, schools(name)')
      .eq('stream', 'school')
      .eq('status', 'sent')
      .lt('due_date', new Date().toISOString().slice(0, 10))
      .order('due_date')
      .limit(8),
  ]);

  if (schoolsRes.error) throw new Error(schoolsRes.error.message);
  if (banksRes.error) throw new Error(banksRes.error.message);
  // overdue is best-effort
  const overdue = ((overdueRes.data ?? []) as any[]).map((inv) => ({
    id: inv.school_id as string,
    name: inv.schools?.name ?? 'Unknown School',
    invoice_number: inv.invoice_number as string,
    amount: Number(inv.amount) || 0,
    currency: (inv.currency as string) ?? 'NGN',
    due_date: inv.due_date as string,
    daysOverdue: Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000),
  }));

  return {
    schools: (schoolsRes.data ?? []) as BillingDocsSchool[],
    bankAccounts: banksRes.data ?? [],
    overdueSchools: overdue,
  };
}

/** Active student headcount for a partner school. */
export async function loadSchoolStudentCount(schoolId: string): Promise<number> {
  const db = billingDocsDb();
  const { count, error } = await db
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'student')
    .eq('is_active', true)
    .eq('school_id', schoolId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Builder context: student count + linked term invoice + derived pricing.
 * academicYear / termNumber optional — when omitted, only count is returned.
 */
export async function loadSchoolInvoiceContext(
  schoolId: string,
  academicYear?: string | null,
  termNumber?: string | null,
) {
  const studentCount = await loadSchoolStudentCount(schoolId);
  let linkedInvoice: LinkedSchoolInvoice | null = null;
  if (academicYear && termNumber) {
    linkedInvoice = await loadLinkedSchoolInvoice(schoolId, academicYear, termNumber);
  }
  return {
    studentCount,
    linkedInvoice,
    pricing: deriveSchoolPricingFromInvoice(linkedInvoice),
  };
}
