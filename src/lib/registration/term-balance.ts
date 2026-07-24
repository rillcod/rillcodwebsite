/**
 * Term registration balance lookup — mirrors special-programme balance-prospect for students table.
 */
import { createClient } from '@supabase/supabase-js';
import { formatNairaAmount } from '@/lib/summer-school/bank-transfer-amount';
import { isCompletedPaymentStatus } from '@/lib/registration/payment-state';
import { TERM_REGISTRATION_BALANCE_PAYMENT_TYPE } from '@/lib/registration/term-registration-intake';

export type TermBalanceStudentRow = {
  id: string;
  full_name: string | null;
  name: string | null;
  parent_email: string | null;
  enrollment_type: string | null;
  status: string | null;
  registration_payment_at: string | null;
};

export type TermBalanceSnapshot = {
  student: TermBalanceStudentRow;
  amountPaid: number;
  totalTuition: number;
  balanceDue: number;
  balanceLabel: string;
  programName: string | null;
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function sumCompletedRegistrationPayments(studentId: string): Promise<number> {
  const supabase = adminClient();
  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('amount, payment_status, payment_gateway_response')
    .contains('payment_gateway_response', { student_id: studentId });

  return (txs ?? [])
    .filter((tx) => isCompletedPaymentStatus(tx.payment_status))
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

export async function getLockedTuitionFromStudentPayments(studentId: string): Promise<{
  totalTuition: number | null;
  programName: string | null;
}> {
  const supabase = adminClient();
  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('payment_gateway_response, created_at')
    .contains('payment_gateway_response', { student_id: studentId })
    .order('created_at', { ascending: true })
    .limit(20);

  for (const tx of txs ?? []) {
    const meta = (tx.payment_gateway_response || {}) as Record<string, unknown>;
    const paymentType = String(meta.payment_type || '');
    if (paymentType !== 'registration' && paymentType !== TERM_REGISTRATION_BALANCE_PAYMENT_TYPE) continue;
    const locked = Number(meta.total_tuition);
    if (Number.isFinite(locked) && locked > 0) {
      return {
        totalTuition: locked,
        programName: meta.program_name ? String(meta.program_name) : null,
      };
    }
  }
  return { totalTuition: null, programName: null };
}

export async function computeTermBalanceSnapshot(
  student: TermBalanceStudentRow,
): Promise<TermBalanceSnapshot | null> {
  const locked = await getLockedTuitionFromStudentPayments(student.id);
  const totalTuition = locked.totalTuition;
  if (!totalTuition || totalTuition <= 0) return null;

  const amountPaid = await sumCompletedRegistrationPayments(student.id);
  const balanceDue = Math.max(0, totalTuition - amountPaid);
  if (balanceDue <= 0) return null;

  const displayName = student.full_name || student.name || 'Student';
  return {
    student,
    amountPaid,
    totalTuition,
    balanceDue,
    balanceLabel: formatNairaAmount(balanceDue),
    programName: locked.programName,
  };
}

export async function findStudentForTermBalancePayment(
  parentEmail: string,
): Promise<TermBalanceSnapshot | null> {
  const email = parentEmail.trim().toLowerCase();
  if (!email) return null;

  const supabase = adminClient();
  const { data: rows } = await supabase
    .from('students')
    .select('id, full_name, name, parent_email, enrollment_type, status, registration_payment_at')
    .eq('parent_email', email)
    .neq('is_deleted', true)
    .in('enrollment_type', ['online', 'school'])
    .order('created_at', { ascending: false })
    .limit(10);

  for (const row of rows ?? []) {
    if (!row.registration_payment_at) continue;
    const snapshot = await computeTermBalanceSnapshot(row as TermBalanceStudentRow);
    if (snapshot) return snapshot;
  }
  return null;
}
