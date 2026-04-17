import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/billing/outstanding — parent outstanding balance per student
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await db.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'parent') return NextResponse.json({ error: 'Forbidden — parents only' }, { status: 403 });

  // Get linked students
  const { data: links } = await db
    .from('parent_student_links')
    .select('student_id, portal_users!student_id(id, full_name)')
    .eq('parent_id', user.id);

  if (!links?.length) return NextResponse.json({ total: 0, perStudent: [] });

  const studentIds = links.map((l: any) => l.student_id);

  const { data: invoices } = await db
    .from('invoices')
    .select('portal_user_id, amount, status, due_date')
    .in('portal_user_id', studentIds)
    .in('status', ['pending', 'overdue']);

  const perStudent = links.map((l: any) => {
    const studentInvoices = (invoices ?? []).filter((inv: any) => inv.portal_user_id === l.student_id);
    const amount = studentInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
    const overdueCount = studentInvoices.filter((inv: any) => inv.status === 'overdue').length;
    return {
      studentId: l.student_id,
      name: l.portal_users?.full_name ?? 'Unknown',
      amount,
      overdueCount,
    };
  });

  const total = perStudent.reduce((sum: number, s: any) => sum + s.amount, 0);
  return NextResponse.json({ total, perStudent });
}
