/**
 * GET /api/payments/statement?studentId=<id>[&email=1]   (admin/teacher/school)
 *
 * Builds a consolidated PDF statement of ALL confirmed payments for a student.
 * Returns the PDF for download; with &email=1 it also emails it to the parent.
 *
 * #11 — consolidated payment history (tax receipts / school records / parent peace of mind).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildStatementDocDef, type StatementLine } from '@/lib/finance/templates/statement';
import { renderPdfToBuffer } from '@/lib/pdfmake-server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller, error: callerError } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
    if (callerError) return NextResponse.json({ error: callerError.message }, { status: 500 });
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const studentId = url.searchParams.get('studentId');
    const doEmail = url.searchParams.get('email') === '1';
    if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });

    const { data: student, error: studentError } = await admin
      .from('students')
      .select('id, full_name, name, user_id, parent_email, parent_name, school_name, school_id')
      .eq('id', studentId)
      .maybeSingle();
    if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 });
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    if (caller.role !== 'admin') {
      const allowedSchoolIds = caller.role === 'school' ? (caller.school_id ? [caller.school_id] : []) : await getTeacherSchoolIds(caller.id, caller.school_id);
      if (!student.school_id || !allowedSchoolIds.includes(student.school_id)) return NextResponse.json({ error: 'You do not have access to this student finance record' }, { status: 403 });
    }

    const studentName = student.full_name || student.name || 'Student';

    // Gather confirmed payments linked to this student's portal user.
    let txns: any[] = [];
    if (student.user_id) {
      const { data, error: transactionError } = await admin
        .from('payment_transactions')
        .select('id, amount, currency, payment_method, transaction_reference, paid_at, created_at, payment_status, invoice_id')
        .eq('portal_user_id', student.user_id)
        .in('payment_status', ['completed', 'success', 'paid', 'refunded'])
        .order('paid_at', { ascending: true });
      if (transactionError) return NextResponse.json({ error: transactionError.message }, { status: 500 });
      txns = data ?? [];
    }

    const lines: StatementLine[] = txns.map((t) => {
      const refunded = String(t.payment_status).toLowerCase() === 'refunded';
      return { date: t.paid_at || t.created_at, description: refunded ? 'Refund / payment reversal' : 'Academic payment / tuition', method: t.payment_method, reference: t.transaction_reference, amount: (refunded ? -1 : 1) * (Number(t.amount) || 0), status: t.payment_status, currency: String(t.currency || 'NGN').toUpperCase(), kind: refunded ? 'refund' : 'payment' };
    });
    const totalsByCurrency = lines.reduce<Record<string, number>>((totals, line) => { totals[line.currency] = (totals[line.currency] || 0) + line.amount; return totals; }, {});
    if (Object.keys(totalsByCurrency).length === 0) totalsByCurrency.NGN = 0;
    const statementRef = `STMT-${String(studentId).slice(0, 8).toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;

    const buffer = await renderPdfToBuffer(buildStatementDocDef({
      studentName,
      payerName: student.parent_name,
      payerEmail: student.parent_email,
      schoolName: student.school_name,
      lines,
      totalsByCurrency,
      generatedAt: new Date().toISOString(),
      statementRef,
    }));

    // Optionally email it to the parent.
    if (doEmail && student.parent_email) {
      try {
        const { notificationsService } = await import('@/services/notifications.service');
        const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
        const html = buildRillcodTransactionalEmailHtml({
          eyebrow: 'Finance',
          title: `Payment statement for ${studentName}`,
          bodyHtml: `<p style="margin:0 0 10px;">Dear ${student.parent_name || 'Parent/Guardian'}, attached is the consolidated statement of all payments on record for <strong>${studentName}</strong> (${lines.length} entries; net ${Object.entries(totalsByCurrency).map(([currency, total]) => `${currency} ${total.toLocaleString()}`).join(", ")}). Keep it for your records.</p>`,
          footerNote: 'rillcod technologies limited • finance',
        });
        await notificationsService.sendExternalEmail({
          to: student.parent_email.trim().toLowerCase(),
          subject: `Payment Statement — ${studentName} | Rillcod Technologies`,
          html,
          fromName: 'Rillcod Technologies',
          fromEmail: 'support@rillcod.com',
          attachments: [{ filename: `${statementRef}.pdf`, content: buffer.toString('base64') }],
        } as any);
      } catch (emailErr) {
        console.error('[statement] email failed:', emailErr);
      }
    }

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${statementRef}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[statement]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
