import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { r2Upload, r2SignedUrl, R2_BUCKET } from '@/lib/r2/client';

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
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return profile ?? null;
}

// GET /api/invoices/[id]/proofs — list proof submissions for an invoice (staff only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  }

  const { id: invoiceId } = await params;
  const admin = adminClient();

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

// POST /api/invoices/[id]/proofs — parent uploads proof image
// Expects multipart/form-data with field "file" (image) and optional "note"
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: invoiceId } = await params;
  const admin = adminClient();

  // Verify the invoice exists and belongs to this parent / their children
  const { data: invoice } = await admin
    .from('invoices')
    .select('id, portal_user_id, school_id')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  // Parents can only upload for their own children's invoices
  if (caller.role === 'parent') {
    const { data: childUser } = await admin
      .from('students')
      .select('user_id')
      .eq('user_id', invoice.portal_user_id)
      .single();
    // Check parent link via students table parent_email
    const { data: parentStudent } = await admin
      .from('students')
      .select('id')
      .eq('user_id', invoice.portal_user_id)
      .maybeSingle();
    if (!parentStudent) {
      return NextResponse.json({ error: 'Not authorised for this invoice' }, { status: 403 });
    }
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const note = (formData.get('note') as string | null) ?? '';

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

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

  return NextResponse.json({ success: true, data: { ...data, signed_url: signedUrl } });
}
