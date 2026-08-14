/**
 * POST /api/partnerships/documents/send — email an issued document to the school.
 *
 * Sends the document that was stored, never a fresh render. A proposal a school
 * received and a proposal we can reprint have to be the same bytes, or the
 * conversation about "what you sent us" has no answer.
 *
 * Delivery flips the row to `sent` and stamps `sent_at`, so the archive shows
 * what actually left the building. The status is only moved after the provider
 * accepts it — a document marked sent that never arrived is worse than one still
 * marked draft.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { notificationsService } from '@/services/notifications.service';
import { buildPartnershipProposalEmail } from '@/lib/email/rillcod-transactional-email';
import { brandContact } from '@/config/brand';
import { computeCharge, normaliseTerms } from '@/lib/partnerships/terms';
import { schoolUpside } from '@/lib/partnerships/proposal-sections';
import { approx, loadProofPoints } from '@/lib/partnerships/proof-points';

export const dynamic = 'force-dynamic';

const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_deleted || profile.is_active === false || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });

  const { data: doc } = await db
    .from('partnership_agreements')
    .select('id, reference, document_kind, status, school_id, document_html, terms_snapshot, share_token')
    .eq('id', id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'That document does not exist.' }, { status: 404 });
  if (!doc.document_html) {
    return NextResponse.json({ error: 'That document has no stored copy to send.' }, { status: 409 });
  }
  if (doc.status === 'void' || doc.status === 'declined') {
    return NextResponse.json(
      { error: `${doc.reference} is ${doc.status}. Issue a fresh document instead of sending this one.` },
      { status: 409 },
    );
  }

  const { data: school } = await db
    .from('schools')
    .select('id, name, email, contact_person, student_count')
    .eq('id', doc.school_id)
    .maybeSingle();
  if (!school) return NextResponse.json({ error: 'That school does not exist.' }, { status: 404 });

  // An explicit recipient wins, so a proposal can go to the proprietor rather
  // than the school's general inbox without editing the school record.
  const to = String(body.to ?? school.email ?? '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json(
      { error: `No usable email address for ${school.name}. Add one to the school, or pass a recipient.` },
      { status: 400 },
    );
  }

  // The headline figure comes from the terms the document was rendered against,
  // so the email and the attachment cannot quote two different numbers.
  const snapshot = normaliseTerms(doc.terms_snapshot as Record<string, unknown>);
  let shareLabel: string | null = null;
  let sharePercent: number | null = null;
  if (snapshot) {
    const charge = computeCharge(snapshot, Number(school.student_count) || 0);
    if (charge.revenueShareOn && charge.schoolSettlement > 0) {
      shareLabel = money(charge.schoolSettlement);
      sharePercent = 100 - charge.sharePercent;
    }
  } else {
    const upside = schoolUpside({
      roll: Number(school.student_count) || 0,
      feePerStudent: 25000,
      sharePercent: 30,
    });
    const full = upside?.rows[upside.rows.length - 1];
    if (full) {
      shareLabel = money(full.schoolShare);
      sharePercent = 30;
    }
  }

  const proof = await loadProofPoints(db, school.id as string);

  // The link the school actually uses: it opens on a phone, survives being
  // forwarded, and for an MoU it is the only way to sign. Built from the token,
  // never the reference, which is sequential and printed on the document.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || brandContact.siteUrl).replace(/\/$/, '');
  const shareUrl = doc.share_token ? `${appUrl}/p/${doc.share_token}` : null;

  const html = buildPartnershipProposalEmail({
    schoolName: String(school.name),
    contactName: (school.contact_person as string) || null,
    reference: String(doc.reference),
    schoolShareLabel: shareLabel,
    sharePercent,
    partnerSchools: proof ? approx(proof.partnerSchools) : null,
    kind: doc.document_kind === 'mou' ? 'mou' : 'proposal',
    shareUrl,
  });

  const safeRef = String(doc.reference).replace(/[^A-Za-z0-9._-]/g, '-');
  const label = doc.document_kind === 'mou' ? 'Memorandum-of-Understanding' : 'Partnership-Proposal';

  /**
   * The PDF is rendered by the browser that was already showing the document,
   * and posted here. That keeps one renderer: whatever the sender previewed is
   * exactly what the school receives, with no server-side second opinion about
   * how the page looks.
   *
   * A missing PDF is not fatal — the stored HTML goes instead, so a document
   * still reaches the school when PDF generation fails on an old browser.
   */
  const pdfBase64 = typeof body.pdf_base64 === 'string' ? body.pdf_base64.trim() : '';
  const pdfBuffer = pdfBase64
    ? Buffer.from(pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64, 'base64')
    : null;
  const hasPdf = !!pdfBuffer && pdfBuffer.length > 1000 && pdfBuffer.subarray(0, 4).toString() === '%PDF';

  const attachment = hasPdf
    ? { filename: `Rillcod-${label}-${safeRef}.pdf`, content: pdfBuffer!.toString('base64') }
    : {
        filename: `Rillcod-${label}-${safeRef}.html`,
        content: Buffer.from(doc.document_html as string, 'utf8').toString('base64'),
      };

  // Keep the exact bytes that were sent. A school asking "what did you send us"
  // must be answerable with the file, not a re-render of today's template.
  let pdfKey: string | null = null;
  if (hasPdf) {
    try {
      const { r2Upload } = await import('@/lib/r2/client');
      pdfKey = `partnerships/${doc.school_id}/${safeRef}.pdf`;
      await r2Upload(pdfKey, pdfBuffer!, 'application/pdf');
    } catch (e) {
      // Storage is a convenience; failing it must not stop the school being sent
      // their proposal.
      console.warn('[partnerships] could not archive the PDF:', e);
      pdfKey = null;
    }
  }

  const sent = await notificationsService.sendEmail('system', {
    to,
    subject:
      doc.document_kind === 'mou'
        ? `Memorandum of Understanding — ${school.name} (${doc.reference})`
        : `Partnership proposal for ${school.name} — coding, robotics & AI`,
    html,
    // No category: the notification-preference gate exists for a user's own
    // alerts, and a prospective school has no preference record to consult.
    templateKey: 'partnership_document',
    referenceId: String(doc.reference),
    attachments: [attachment],
  });

  if (!sent) {
    // Status stays where it was: a row marked sent that never arrived is worse
    // than one still marked draft.
    return NextResponse.json(
      { error: 'The provider did not accept the message. The document is unchanged.' },
      { status: 502 },
    );
  }

  const { data: updated, error } = await db
    .from('partnership_agreements')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      ...(pdfKey ? { pdf_r2_key: pdfKey } : {}),
    })
    .eq('id', id)
    .select('id, reference, status, sent_at, pdf_r2_key')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(db as any, {
    action: 'send_partnership_document',
    actorId: user.id,
    resourceType: 'partnership_agreements',
    resourceId: id,
    tableName: 'partnership_agreements',
    newValue: `${doc.reference} emailed to ${to} as ${hasPdf ? 'PDF' : 'HTML'}`,
    newValues: {
      school_id: school.id,
      to,
      reference: doc.reference,
      kind: doc.document_kind,
      attachment: attachment.filename,
      pdf_r2_key: pdfKey,
    },
  });

  return NextResponse.json({
    sent: true,
    to,
    attachment: attachment.filename,
    format: hasPdf ? 'pdf' : 'html',
    document: updated,
  });
}
