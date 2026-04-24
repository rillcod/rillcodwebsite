import { createClient } from '@supabase/supabase-js';
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
    .select('id, invoice_id, school_id, owner_school_id, status')
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

  // If cycle has a linked invoice, record the proof there for admin review
  if (cycle.invoice_id) {
    const { data, error } = await db
      .from('invoice_payment_proofs')
      .insert({
        invoice_id: cycle.invoice_id,
        submitted_by: caller.id,
        proof_image_url: key,
        payer_note: note
          ? `[Billing Cycle ${id}] ${note}`
          : `[Billing Cycle ${id}]`,
      })
      .select('id, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    responseData = { ...data, signed_url: signedUrl };
  }

  // Notify admins and school teachers (fire-and-forget)
  void notifyStaffOfPayment({
    schoolId: cycle.school_id || cycle.owner_school_id,
    title: 'Payment Evidence Uploaded',
    message: `${schoolName} uploaded payment proof for billing cycle (ref: ${id.slice(0, 8)}…). Please review and confirm.`,
    actionUrl: '/dashboard/finance?tab=billing_cycles',
  });

  return NextResponse.json({ success: true, data: responseData });
}
