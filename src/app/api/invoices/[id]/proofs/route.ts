import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { r2Upload, r2SignedUrl, R2_BUCKET } from '@/lib/r2/client';
import { notifyStaffOfPayment } from '@/lib/payments/notify-staff';
import { logAudit } from '@/lib/audit/log';
import { verifyInvoicePayment } from '@/lib/payments/verified-payment';
import { getParentLinkScope } from '@/lib/parents/links';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { SMTP_FROM_EMAIL } from '@/config/brand';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getUser() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id, email')
    .eq('id', user.id)
    .single();
  return profile ?? null;
}

async function resolveInvoiceSchoolId(admin: ReturnType<typeof adminClient>, invoice: { school_id?: string | null; portal_user_id?: string | null }) {
  if (invoice.school_id) return invoice.school_id;
  if (!invoice.portal_user_id) return null;
  const { data: payer } = await admin
    .from('portal_users')
    .select('school_id')
    .eq('id', invoice.portal_user_id)
    .maybeSingle();
  return (payer as { school_id?: string | null } | null)?.school_id || null;
}

async function canAccessInvoiceProof(
  admin: ReturnType<typeof adminClient>,
  caller: { id: string; role: string; school_id: string | null; email?: string | null },
  invoice: { portal_user_id?: string | null; school_id?: string | null },
  mode: 'submit' | 'review',
) {
  if (caller.role === 'admin') return true;

  if (caller.role === 'parent') {
    if (mode !== 'submit' || !invoice.portal_user_id) return false;
    const { studentUserIds } = await getParentLinkScope(
      admin as any,
      { id: caller.id, email: caller.email || undefined },
    );
    return studentUserIds.includes(invoice.portal_user_id);
  }

  if (caller.role === 'student') {
    return mode === 'submit' && invoice.portal_user_id === caller.id;
  }

  if (caller.role === 'teacher') return false;

  if (caller.role === 'school') {
    const invoiceSchoolId = await resolveInvoiceSchoolId(admin, invoice);
    if (!invoiceSchoolId) return false;
    const allowedSchoolIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    return allowedSchoolIds.includes(invoiceSchoolId);
  }

  return false;
}

// GET /api/invoices/[id]/proofs — list proof submissions for an invoice (staff only)
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  }

  const { id: invoiceId } = await context.params;
  const admin = adminClient();

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, portal_user_id, school_id')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (!(await canAccessInvoiceProof(admin, caller, invoice, 'review'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('invoice_payment_proofs')
    .select('*, portal_users!invoice_payment_proofs_submitted_by_fkey(full_name, email)')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for proof images
  const enriched = await Promise.all(
    (data ?? []).map(async (proof: any) => {
      let signedUrl: string | null = null;
      if (proof.proof_image_url) {
        try {
          // key is stored as r2 key or full URL — extract key if needed
          const key = proof.proof_image_url.startsWith('http')
            ? new URL(proof.proof_image_url).pathname.replace(/^\//, '')
            : proof.proof_image_url;
          signedUrl = await r2SignedUrl(key, 3600);
        } catch { /* fallback to raw URL */ signedUrl = proof.proof_image_url; }
      }
      return { ...proof, signed_url: signedUrl };
    }),
  );

  return NextResponse.json({ data: enriched });
}

// POST /api/invoices/[id]/proofs — parent submits payment evidence
// Accepts either:
//   multipart/form-data  with field "file" (image/PDF) + optional "note"
//   application/json     with { receipt_no (required), grade_level, payment_method, child_name, note }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: invoiceId } = await context.params;
  const admin = adminClient();

  // Verify the invoice exists and belongs to this parent / their children
  const { data: invoice } = await admin
    .from('invoices')
    .select('id, portal_user_id, school_id')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  if (!(await canAccessInvoiceProof(admin, caller, invoice, 'submit'))) {
    return NextResponse.json({ error: 'Not authorised for this invoice' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  // ── JSON path (text-only submission) ──────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    const { receipt_no, grade_level, payment_method, child_name, note, payment_date } = body as {
      receipt_no?: string;
      grade_level?: string;
      payment_method?: string;
      child_name?: string;
      note?: string;
      payment_date?: string;
    };

    if (!receipt_no?.trim()) {
      return NextResponse.json({ error: 'receipt_no is required' }, { status: 400 });
    }

    const validMethods = ['cash', 'bank_transfer', 'pos', 'mobile_money', 'other'];
    if (payment_method && !validMethods.includes(payment_method)) {
      return NextResponse.json({ error: 'Invalid payment_method' }, { status: 400 });
    }

    const payerNote = JSON.stringify({
      receipt_no: receipt_no.trim(),
      grade: grade_level ?? null,
      method: payment_method ?? null,
      child_name: child_name ?? null,
      payment_date: payment_date ?? null,
      note: note ?? null,
    });

    const { data, error } = await admin
      .from('invoice_payment_proofs')
      .insert({
        invoice_id: invoiceId,
        submitted_by: caller.id,
        proof_image_url: null,
        payer_note: payerNote,
      })
      .select('id, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAudit(admin as any, {
      action: 'invoice_payment_proof_submitted',
      actorId: caller.id,
      resourceType: 'invoice',
      resourceId: invoiceId,
      tableName: 'invoice_payment_proofs',
      recordId: data.id,
      newValue: `Proof submitted (receipt ${receipt_no.trim()})`,
      newValues: {
        proof_id: data.id,
        receipt_no: receipt_no.trim(),
        payment_method: payment_method ?? null,
        school_id: invoice.school_id ?? null,
        via: 'json',
      },
    });

    void notifyStaffOfPayment({
      schoolId: invoice.school_id,
      title: 'Payment Evidence Submitted',
      message: `A ${caller.role} submitted payment evidence (receipt: ${receipt_no.trim()}) for invoice ${invoiceId.slice(0, 8)}…. Please review and verify.`,
      actionUrl: '/dashboard/finance?workspace=collections&ops=approvals',
    });

    return NextResponse.json({ success: true, data: { ...data, signed_url: null } });
  }

  // ── Multipart/form-data path (file upload) ────────────────────
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const note = (formData.get('note') as string | null) ?? '';

  if (!file) return NextResponse.json({ error: 'A file or a receipt_no (JSON) is required' }, { status: 400 });

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only images and PDF are accepted' }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'jpg';
  const key = `payment-proofs/${invoiceId}/${caller.id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await r2Upload(key, buffer, file.type);
  } catch (e: any) {
    return NextResponse.json({ error: `Upload failed: ${e.message}` }, { status: 500 });
  }

  const { data, error } = await admin
    .from('invoice_payment_proofs')
    .insert({
      invoice_id: invoiceId,
      submitted_by: caller.id,
      proof_image_url: key,
      payer_note: note || null,
    })
    .select('id, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signedUrl = await r2SignedUrl(key, 3600).catch(() => null);

  await logAudit(admin as any, {
    action: 'invoice_payment_proof_submitted',
    actorId: caller.id,
    resourceType: 'invoice',
    resourceId: invoiceId,
    tableName: 'invoice_payment_proofs',
    recordId: data.id,
    newValue: 'Proof file uploaded',
    newValues: {
      proof_id: data.id,
      school_id: invoice.school_id ?? null,
      via: 'upload',
      has_file: true,
    },
  });

  // Notify admins + teachers linked to the invoice's school (fire-and-forget)
  void notifyStaffOfPayment({
    schoolId: invoice.school_id,
    title: 'Payment Evidence Submitted',
    message: `A ${caller.role} submitted payment proof for invoice ${invoiceId.slice(0, 8)}…. Please review and verify.`,
    actionUrl: '/dashboard/finance?workspace=collections&ops=approvals',
  });

  return NextResponse.json({ success: true, data: { ...data, signed_url: signedUrl } });
}

// PATCH /api/invoices/[id]/proofs — admin reviews a proof (approve / reject / request_more)
// Body: { proof_id: string; action: 'approved' | 'rejected' | 'request_more'; admin_note?: string }
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  }

  const { id: invoiceId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const { proof_id, action, admin_note } = body as { proof_id: string; action: string; admin_note?: string };

  if (!proof_id || !action) {
    return NextResponse.json({ error: 'proof_id and action are required' }, { status: 400 });
  }

  if (!['approved', 'rejected', 'request_more'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action. Use: approved | rejected | request_more' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, invoice_number, amount, currency, portal_user_id, school_id')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (!(await canAccessInvoiceProof(admin, caller, invoice, 'review'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('invoice_payment_proofs')
    .update({
      status: action,
      admin_note: admin_note ?? null,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq('id', proof_id)
    .eq('invoice_id', invoiceId)
    .select('id, status, admin_note')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let paymentResult: Awaited<ReturnType<typeof verifyInvoicePayment>> | null = null;

  // If approved → complete the full finance path: transaction, invoice, receipt,
  // acknowledgement, and audit. Never mark only invoices.status directly.
  if (action === 'approved') {
    paymentResult = await verifyInvoicePayment({
      invoiceId,
      method: 'bank_transfer',
      actorId: caller.id,
      source: 'invoice_proof_approval',
      proofId: proof_id,
      note: admin_note,
    });
    await logAudit(admin as any, {
      action: 'invoice_payment_proof_approved',
      actorId: caller.id,
      resourceType: 'invoice',
      resourceId: invoiceId,
      newValue: `Approved payment proof for invoice ${invoice.invoice_number || invoiceId.slice(0, 8)}`,
      newValues: {
        summary: `Approved payment proof for invoice ${invoice.invoice_number || '—'}`,
        invoice_number: invoice.invoice_number ?? null,
        amount: invoice.amount ?? null,
        currency: invoice.currency ?? null,
        proof_id,
        transaction_id: paymentResult.transactionId,
      },
    });
  } else if (action === 'rejected' || action === 'request_more') {
    await logAudit(admin as any, {
      action: action === 'rejected' ? 'invoice_payment_proof_rejected' : 'invoice_payment_proof_needs_more',
      actorId: caller.id,
      resourceType: 'invoice',
      resourceId: invoiceId,
      newValue: `${action} proof for invoice ${invoice.invoice_number || invoiceId.slice(0, 8)}`,
      newValues: {
        invoice_number: invoice.invoice_number ?? null,
        proof_id,
        admin_note: admin_note ?? null,
        status: action,
      },
    });
  }

  // Notify the submitter
  const { data: proof } = await admin
    .from('invoice_payment_proofs')
    .select('submitted_by, portal_users!invoice_payment_proofs_submitted_by_fkey(id, email, full_name)')
    .eq('id', proof_id)
    .single();

  const submitter = (proof as any)?.portal_users;
  if (submitter?.email) {
    const actionLabel = action === 'approved' ? 'approved ✓' : action === 'rejected' ? 'rejected' : 'flagged for more info';
    const msgHtml = `<p>Hello ${submitter.full_name},</p><p>Your payment proof for invoice <strong>${invoiceId}</strong> has been <strong>${actionLabel}</strong> by our team.</p>${admin_note ? `<p><strong>Note from reviewer:</strong> ${admin_note}</p>` : ''}<p>Log in to your dashboard for more details.</p>`;
    try {
      await (await import('@/services/notifications.service')).notificationsService.sendEmail(submitter.id, {
        to: submitter.email,
        subject: `Your payment proof has been ${actionLabel}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">${msgHtml}</div>`,
        fromName: 'Rillcod Technologies',
        fromEmail: SMTP_FROM_EMAIL,
      });
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ success: true, data, payment: paymentResult });
}
