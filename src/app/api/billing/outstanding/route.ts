import { invoiceOutstandingAmount, isOverdueInvoice, OPEN_INVOICE_STATUSES } from '@/lib/finance/invoice-state';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getParentLinkScope } from '@/lib/parents/links';

export const dynamic = 'force-dynamic';

// GET /api/billing/outstanding - parent outstanding balance per student
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await (supabase as any).from('portal_users').select('role, email').eq('id', user.id).single();
  if (profile?.role !== 'parent') return NextResponse.json({ error: 'Forbidden - parents only' }, { status: 403 });

  const admin = createAdminClient();
  const { studentUserIds } = await getParentLinkScope(
    admin as any,
    { id: user.id, email: profile.email || undefined },
  );

  if (studentUserIds.length === 0) return NextResponse.json({ total: 0, perStudent: [] });

  const { data: students } = await (admin as any)
    .from('portal_users')
    .select('id, full_name')
    .in('id', studentUserIds);

  const { data: invoices } = await (admin as any)
    .from('invoices')
    .select('portal_user_id, amount, status, due_date')
    .in('portal_user_id', studentUserIds)
    .in('status', [...OPEN_INVOICE_STATUSES]);

  const now = Date.now();
  const perStudent = (students ?? []).map((student: any) => {
    const studentInvoices = (invoices ?? []).filter((inv: any) => inv.portal_user_id === student.id);
    const amount = studentInvoices.reduce((sum: number, inv: any) => sum + invoiceOutstandingAmount(inv), 0);
    const overdueCount = studentInvoices.filter((inv: any) => isOverdueInvoice(inv, new Date(now))).length;
    return {
      studentId: student.id,
      name: student.full_name ?? 'Unknown',
      amount,
      overdueCount,
    };
  });

  const total = perStudent.reduce((sum: number, s: any) => sum + s.amount, 0);
  return NextResponse.json({ total, perStudent });
}
