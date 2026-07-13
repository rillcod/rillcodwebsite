import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: caller } = user
      ? await (supabase as any).from('portal_users').select('id, full_name, role').eq('id', user.id).single()
      : { data: null };

    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
    }

    const {
      schoolId, docRef, invoiceRef, amount, studentCount,
      period, dueDate, currency, recipientEmail,
    } = await req.json();

    if (!schoolId) return NextResponse.json({ success: false, message: 'schoolId is required' }, { status: 400 });

    // Resolve school name
    const { data: schoolRow } = await (supabase as any)
      .from('schools').select('name').eq('id', schoolId).maybeSingle();
    const schoolName: string = schoolRow?.name ?? 'Partner School';

    // Resolve email: recipientEmail override → billing_contacts → school portal user
    let toEmail: string | undefined = recipientEmail?.trim() || undefined;
    if (!toEmail) {
      const { data: bc } = await (supabase as any)
        .from('billing_contacts').select('representative_email').eq('school_id', schoolId).maybeSingle();
      toEmail = bc?.representative_email || undefined;
    }
    if (!toEmail) {
      const { data: su } = await (supabase as any)
        .from('portal_users').select('email').eq('school_id', schoolId).eq('role', 'school').maybeSingle();
      toEmail = su?.email || undefined;
    }
    if (!toEmail) {
      return NextResponse.json({
        success: false,
        message: 'No email address found for this school — enter one manually.',
      }, { status: 400 });
    }

    const fmtAmt = currency === 'USD'
      ? `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : `₦${Number(amount).toLocaleString('en-NG')}`;
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    const ref = invoiceRef ?? docRef;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com').replace(/\/$/, '');

    const html = buildRillcodTransactionalEmailHtml({
      title: `Billing Statement ${ref}`,
      eyebrow: schoolName,
      accentColor: '#7c3aed',
      bodyHtml: `
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:15px;line-height:1.7;">
          Dear ${escapeHtml(schoolName)},
        </p>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:15px;line-height:1.7;">
          Please find your billing statement from <strong style="color:#fff;">Rillcod Technologies</strong>
          for the period <strong style="color:#fff;">${escapeHtml(period)}</strong>.
          Kindly arrange payment within 14 days of receipt.
        </p>
        <p style="margin:0 0 6px;color:#a1a1aa;font-size:13px;line-height:1.6;">
          Quote reference <strong style="color:#c4b5fd;">${escapeHtml(ref)}</strong> in your payment narration.
        </p>
      `,
      summaryRows: [
        { label: 'Reference', value: ref },
        { label: 'Period', value: period },
        { label: 'Students', value: String(studentCount ?? '—') },
        { label: 'Due Date', value: dueDate ? fmtDate(dueDate) : '—', highlight: true },
        { label: 'Total Due', value: fmtAmt, highlight: true },
      ],
      cta: { href: `${appUrl}/dashboard/finance?workspace=reports`, label: 'Open Finance Reports', color: '#0f766e' },
      footerNote: `Sent by ${escapeHtml(caller.full_name)} · Rillcod Technologies`,
    });

    await notificationsService.sendEmail(caller.id, {
      to: toEmail,
      subject: `Billing Statement ${ref} — Rillcod Technologies`,
      html,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
      replyTo: 'support@rillcod.com',
    });

    // Persist email to billing_contacts so it pre-fills next time
    const { data: existing } = await (supabase as any)
      .from('billing_contacts').select('id, representative_email').eq('school_id', schoolId).maybeSingle();
    if (!existing) {
      await (supabase as any).from('billing_contacts').insert({
        school_id: schoolId, owner_type: 'school',
        representative_email: toEmail, representative_name: schoolName, owner_user_id: caller.id,
      });
    } else if (!existing.representative_email) {
      await (supabase as any).from('billing_contacts').update({ representative_email: toEmail }).eq('id', existing.id);
    }

    return NextResponse.json({ success: true, message: `Statement sent to ${toEmail}` });
  } catch (err: any) {
    console.error('[billing/email-statement]', err);
    return NextResponse.json({ success: false, message: err?.message ?? 'Failed to send email' }, { status: 500 });
  }
}
