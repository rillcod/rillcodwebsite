import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { logAudit } from '@/lib/audit/log';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { isDeliverableExternalEmail } from '@/lib/finance/smart-communication';

// POST /api/payments/resend-receipt
// Body: { receiptId?: string, portalUserId?: string, studentId?: string, recipientEmail?: string }
// Supports both Partner School receipts and individual student/parent receipts.
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createEngagementAdminClient();
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabaseAdmin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();
    if (!caller || !roleHasCapability(caller.role, 'manage_finance')) {
      return NextResponse.json({ error: 'Finance administrator access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const overrideEmail = typeof body.recipientEmail === 'string' && body.recipientEmail.trim()
      ? body.recipientEmail.trim()
      : null;

    // ── Path A: Explicit receiptId (supports School AND Individual receipts) ──
    if (body.receiptId) {
      const { data: receipt } = await supabaseAdmin
        .from('receipts')
        .select('*, portal_users!receipts_student_id_fkey(full_name, email), schools!receipts_school_id_fkey(name)')
        .eq('id', body.receiptId)
        .maybeSingle();

      if (!receipt) {
        return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
      }

      const linkedUserId: string | null =
        (receipt as any).student_id || (receipt as any).portal_user_id || null;
      const isSchool = receipt.stream === 'school' || (Boolean(receipt.school_id) && !linkedUserId);
      let toEmail: string | null = overrideEmail;
      const payerLabel: string = isSchool
        ? ((receipt.schools as any)?.name || (receipt.metadata as any)?.payer_name || 'Partner School')
        : ((receipt.metadata as any)?.payer_name || (receipt.portal_users as any)?.full_name || 'Valued Client');

      if (!toEmail && isSchool && receipt.school_id) {
        const { data: bc } = await supabaseAdmin
          .from('billing_contacts')
          .select('representative_email, representative_name')
          .eq('school_id', receipt.school_id)
          .maybeSingle();
        if (isDeliverableExternalEmail(bc?.representative_email)) {
          toEmail = bc!.representative_email!.trim();
        }
        if (!toEmail) {
          const { data: su } = await supabaseAdmin
            .from('portal_users')
            .select('email')
            .eq('school_id', receipt.school_id)
            .eq('role', 'school')
            .maybeSingle();
          if (isDeliverableExternalEmail(su?.email)) toEmail = su!.email!.trim();
        }
      } else if (!toEmail && linkedUserId) {
        const { data: stu } = await supabaseAdmin
          .from('students')
          .select('parent_email, student_email')
          .eq('user_id', linkedUserId)
          .maybeSingle();
        if (isDeliverableExternalEmail(stu?.parent_email)) {
          toEmail = stu!.parent_email!.trim();
        } else if (isDeliverableExternalEmail((receipt.portal_users as any)?.email)) {
          toEmail = (receipt.portal_users as any).email.trim();
        } else if (isDeliverableExternalEmail(stu?.student_email)) {
          toEmail = stu!.student_email!.trim();
        }
      }

      if (!toEmail) {
        return NextResponse.json(
          { error: 'No deliverable email on file — please supply recipientEmail', needsEmail: true },
          { status: 400 },
        );
      }

      const amt = Number(receipt.amount) || 0;
      const docRef = receipt.receipt_number || receipt.id.slice(0, 8).toUpperCase();
      const receiptUrl = receipt.pdf_url || '';

      let attachments: Array<{ filename: string; content: string }> | undefined;
      if (receiptUrl) {
        try {
          const r = await fetch(receiptUrl);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            const safeName = payerLabel.replace(/[^a-z0-9]+/gi, '_');
            attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
          }
        } catch { /* non-fatal */ }
      }

      const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
      const now = new Date();
      const fmt = (d: string | null) =>
        d
          ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
          : now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

      const rawItems = Array.isArray((receipt.metadata as any)?.items) ? (receipt.metadata as any).items : [];
      const items =
        rawItems.length > 0
          ? rawItems.map((it: any) => ({
              description: String(it.description || 'Payment'),
              quantity: Number(it.quantity ?? 1),
              unit_price: Number(it.unit_price ?? amt),
            }))
          : [{ description: isSchool ? 'Partner School Term Payment' : 'Academic Enrolment / Tuition Fee', quantity: 1, unit_price: amt }];

      const html = buildReceiptHTML({
        docRef,
        dateStr: fmt(null),
        payDateStr: fmt(receipt.issued_at),
        payerLabel,
        payerType: isSchool ? 'school' : 'student',
        paymentMethod: (receipt.metadata as any)?.payment_method || 'bank_transfer',
        receivedBy: (receipt.metadata as any)?.received_by || 'Rillcod Technologies',
        items,
        totalAmount: amt,
        payToAcc: null,
        notes: `Receipt #${docRef}. Sent on request — issued ${fmt(receipt.issued_at)}.${attachments ? ' Official PDF receipt attached.' : ''}`,
        mode: 'email',
        actionUrl: receiptUrl || undefined,
      });

      const { notificationsService } = await import('@/services/notifications.service');
      await notificationsService.sendExternalEmail({
        to: toEmail,
        subject: `Payment Receipt #${docRef} — ₦${amt.toLocaleString('en-NG')} | Rillcod Technologies`,
        html,
        fromName: 'Rillcod Technologies',
        fromEmail: SMTP_FROM_EMAIL,
        ...(attachments ? { attachments } : {}),
      });

      await logAudit(supabaseAdmin as any, {
        action: 'receipt_resent',
        actorId: caller.id,
        resourceType: 'receipt',
        resourceId: receipt.id,
        newValue: toEmail,
        newValues: { amount: amt, reference: docRef, sent_to: toEmail },
      });

      return NextResponse.json({
        success: true,
        message: `Receipt sent to ${toEmail}`,
        sent_to: toEmail,
        amount: amt,
        reference: docRef,
      });
    }

    // ── Path B: Legacy portalUserId / studentId lookup ────────────────────────
    let portalUserId: string | null = body.portalUserId || null;
    let fallbackParentEmail: string | null = null;

    if (!portalUserId && body.studentId) {
      const { data: stu } = await supabaseAdmin
        .from('students')
        .select('user_id, parent_email, student_email, full_name')
        .eq('id', body.studentId)
        .single();
      if (!stu?.user_id) {
        return NextResponse.json({ error: 'Student has no portal account yet. Activate first.' }, { status: 400 });
      }
      portalUserId = stu.user_id;
      fallbackParentEmail = stu.parent_email || stu.student_email || null;
    }

    if (!portalUserId) return NextResponse.json({ error: 'receiptId, portalUserId, or studentId is required' }, { status: 400 });

    const { data: payer } = await supabaseAdmin
      .from('portal_users')
      .select('full_name, email, school_id')
      .eq('id', portalUserId)
      .single();

    if (!fallbackParentEmail) {
      const { data: stu } = await supabaseAdmin
        .from('students')
        .select('parent_email, student_email')
        .eq('user_id', portalUserId)
        .maybeSingle();
      fallbackParentEmail = stu?.parent_email || stu?.student_email || null;
    }

    const toEmail =
      overrideEmail
      || (isDeliverableExternalEmail(fallbackParentEmail) ? fallbackParentEmail!.trim() : null)
      || (isDeliverableExternalEmail(payer?.email) ? payer!.email!.trim() : null);

    if (!toEmail) {
      return NextResponse.json({ error: 'No deliverable email on file for this user', needsEmail: true }, { status: 400 });
    }

    // Find the most recent completed payment for this user
    const { data: tx } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, amount, currency, payment_method, transaction_reference, paid_at, created_at, receipt_url')
      .eq('portal_user_id', portalUserId)
      .in('payment_status', ['completed', 'success'])
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ error: 'No completed payment found for this user' }, { status: 404 });
    }

    const amt = Number(tx.amount) || 0;
    const docRef = tx.transaction_reference || tx.id.slice(0, 8).toUpperCase();

    let receiptUrl = tx.receipt_url || '';
    if (!receiptUrl) {
      try {
        const { issueReceiptForTransaction } = await import('@/lib/finance/issue');
        const result = await issueReceiptForTransaction(tx.id);
        receiptUrl = result.url;
      } catch (genErr) {
        console.error('[resend-receipt] Receipt generation failed:', genErr);
      }
    }

    let attachments: Array<{ filename: string; content: string }> | undefined;
    if (receiptUrl) {
      try {
        const r = await fetch(receiptUrl);
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          const safeName = (payer?.full_name || 'Payer').replace(/[^a-z0-9]+/gi, '_');
          attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
        }
      } catch { /* non-fatal */ }
    }

    const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
    const now = new Date();
    const fmt = (d: string | null) => d
      ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
      : now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

    const html = buildReceiptHTML({
      docRef,
      dateStr: fmt(null),
      payDateStr: fmt(tx.paid_at || tx.created_at),
      payerLabel: payer?.full_name || toEmail,
      payerType: 'student',
      paymentMethod: tx.payment_method || 'online',
      receivedBy: 'Rillcod Technologies',
      items: [{ description: 'Academic Enrolment / Tuition Fee', quantity: 1, unit_price: amt }],
      totalAmount: amt,
      payToAcc: null,
      notes: `Reference: ${docRef}. Resent on request — original payment date: ${fmt(tx.paid_at || tx.created_at)}.${attachments ? ' Your receipt PDF is attached.' : ''}`,
      mode: 'email',
      actionUrl: receiptUrl,
    });

    const { notificationsService } = await import('@/services/notifications.service');
    await notificationsService.sendExternalEmail({
      to: toEmail,
      subject: `Payment Receipt (Resent) — ₦${amt.toLocaleString('en-NG')} | Rillcod Technologies`,
      html,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
      ...(attachments ? { attachments } : {}),
    });

    await logAudit(supabaseAdmin as any, {
      action: 'receipt_resent',
      actorId: caller.id,
      resourceType: 'payment_transaction',
      resourceId: tx.id,
      newValue: toEmail,
      newValues: {
        amount: amt,
        reference: docRef,
        sent_to: toEmail,
        portal_user_id: portalUserId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Receipt resent to ${toEmail}`,
      sent_to: toEmail,
      amount: amt,
      reference: docRef,
    });
  } catch (err: any) {
    console.error('[resend-receipt]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

