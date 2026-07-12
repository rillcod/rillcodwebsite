import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { r2Upload, r2SignedUrl } from '@/lib/r2/client';
import { notifyStaffOfPayment } from '@/lib/payments/notify-staff';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null } | null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['school', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const db = createAdminClient();

  const { data: cycle } = await db
    .from('billing_cycles')
    .select('id, invoice_id, school_id, owner_school_id, owner_user_id, owner_type, status, amount_due, currency, due_date, term_label, items')
    .eq('id', id)
    .single();

  if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });

  // Scope check: school can only upload for their own cycles
  if (caller.role === 'school') {
    const schoolId = caller.school_id;
    if (!schoolId || (cycle.school_id !== schoolId && cycle.owner_school_id !== schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (!['due', 'past_due'].includes(cycle.status)) {
    return NextResponse.json({ error: 'Proof can only be uploaded for due or past-due cycles' }, { status: 400 });
  }

  let invoiceId = cycle.invoice_id as string | null;
  if (!invoiceId) {
    const { createInvoice } = await import('@/lib/finance/create-invoice');
    const amount = Number(cycle.amount_due) || 0;
    const result = await createInvoice({
      school_id: cycle.owner_type === 'school' ? (cycle.owner_school_id || cycle.school_id || null) : null,
      portal_user_id: cycle.owner_type === 'individual' ? (cycle.owner_user_id || null) : null,
      amount, currency: cycle.currency || 'NGN', due_date: cycle.due_date || null, status: 'sent',
      stream: cycle.owner_type === 'school' ? 'school' : 'individual',
      billing_cycle_id: cycle.id,
      notes: `Auto-generated from billing cycle: ${cycle.term_label || cycle.id}`,
      items: [{ description: cycle.term_label || 'Billing cycle', quantity: 1, unit_price: amount, total: amount }],
      metadata: { source: 'billing_cycle_proof', term_label: cycle.term_label || null },
    });
    if (!result.ok) return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.code === 'conflict' ? 409 : 500 });
    invoiceId = String(result.data.id);
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const note = (formData.get('note') as string | null) ?? '';

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, WebP, or PDF accepted' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'jpg';
  const key = `billing-cycle-proofs/${id}/${caller.id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await r2Upload(key, buffer, file.type);
  } catch (e: any) {
    return NextResponse.json({ error: `Upload failed: ${e.message}` }, { status: 500 });
  }

  const signedUrl = await r2SignedUrl(key, 3600).catch(() => null);

  // Fetch caller's school name for the notification message
  const { data: schoolRow } = await db
    .from('schools')
    .select('name')
    .eq('id', caller.school_id ?? '')
    .maybeSingle();
  const schoolName = (schoolRow as any)?.name || caller.school_id || 'A school';

  let responseData: Record<string, unknown> = { key, signed_url: signedUrl };

  const { data, error } = await db
    .from('invoice_payment_proofs')
    .insert({
      invoice_id: invoiceId,
      submitted_by: caller.id,
      proof_image_url: key,
      payer_note: note
        ? `[Billing Cycle ${id}] ${note}`
        : `[Billing Cycle ${id}]`,
    })
    .select('id, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  responseData = { ...data, invoice_id: invoiceId, signed_url: signedUrl };

  // Notify admins and school teachers (fire-and-forget)
  void notifyStaffOfPayment({
    schoolId: cycle.school_id || cycle.owner_school_id,
    title: 'Payment Evidence Uploaded',
    message: `${schoolName} uploaded payment proof for billing cycle (ref: ${id.slice(0, 8)}â€¦). Please review and confirm.`,
    actionUrl: '/dashboard/finance?workspace=billing',
  });

  return NextResponse.json({ success: true, data: responseData });
}
