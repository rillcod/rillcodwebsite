import { billingDocsDb } from '@/lib/billing/docs-auth';

export type BillingDocsStudent = {
  id: string;
  full_name: string;
  section_class: string | null;
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
  portal_user_id: string | null;
  metadata?: { payment_method?: string } | null;
};

export type BillingDocsAttendanceStudent = {
  student_id: string;
  full_name: string;
  section_class: string;
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
  metadata?: { term_label?: string; academic_year?: number; term_number?: number; payment_method?: string } | null;
};

/** Payment-register payload: active students + per-student invoices/receipts. */
export async function loadPaymentRegisterData(schoolId: string) {
  const db = billingDocsDb();
  const [stuRes, invRes, recRes] = await Promise.all([
    db
      .from('portal_users')
      .select('id, full_name, section_class, email')
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
      .select('id, receipt_number, amount, issued_at, portal_user_id, metadata')
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
    receipts: (recRes.data ?? []) as BillingDocsReceipt[],
  };
}

/** Attendance roster payload scoped to one school + date window. */
export async function loadAttendanceRosterData(schoolId: string, dateFrom: string, dateTo: string) {
  const db = billingDocsDb();
  const { data, error } = await db
    .from('attendance')
    .select(`
      student_id, status,
      class_sessions!inner(session_date, classes!inner(name, school_id)),
      portal_users!attendance_student_id_fkey(full_name, section_class, school_id)
    `)
    .eq('status', 'present')
    .eq('class_sessions.classes.school_id', schoolId)
    .gte('class_sessions.session_date', dateFrom)
    .lte('class_sessions.session_date', dateTo);

  if (error) throw new Error(error.message);

  const byStudent: Record<string, BillingDocsAttendanceStudent> = {};
  for (const row of (data ?? []) as any[]) {
    const uid = row.student_id as string | null;
    if (!uid || !row.portal_users || !row.class_sessions) continue;
    if (row.portal_users.school_id && row.portal_users.school_id !== schoolId) continue;
    if (!byStudent[uid]) {
      byStudent[uid] = {
        student_id: uid,
        full_name: row.portal_users.full_name ?? '—',
        section_class: row.portal_users.section_class ?? '—',
        sessions: [],
      };
    }
    const d = row.class_sessions?.session_date;
    if (d && !byStudent[uid].sessions.includes(d)) byStudent[uid].sessions.push(d);
  }

  return Object.values(byStudent).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function loadLinkedSchoolInvoice(schoolId: string, academicYear: string, termNumber: string) {
  const db = billingDocsDb();
  const { data, error } = await db
    .from('invoices')
    .select('id, invoice_number, amount, currency, status, due_date, payment_link, items, metadata')
    .eq('school_id', schoolId)
    .eq('stream', 'school')
    .not('status', 'eq', 'cancelled')
    .filter('metadata->>academic_year', 'eq', academicYear)
    .filter('metadata->>term_number', 'eq', termNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LinkedSchoolInvoice | null) ?? null;
}

export async function loadBillingDocsBootstrap() {
  const db = billingDocsDb();
  const [schoolsRes, banksRes, overdueRes] = await Promise.all([
    db.from('schools').select('id, name').order('name'),
    db.from('payment_accounts').select('*').eq('is_active', true).is('school_id', null).order('created_at', { ascending: false }),
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
    schools: (schoolsRes.data ?? []) as { id: string; name: string }[],
    bankAccounts: banksRes.data ?? [],
    overdueSchools: overdue,
  };
}
