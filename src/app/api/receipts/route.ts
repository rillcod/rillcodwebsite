import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return profile;
}

// GET /api/receipts — role-aware receipt listing.
// admin → all receipts (optionally scoped by ?school_id=)
// school → receipts for the caller's school_id
// teacher → receipts for the caller's school_id (partner schools' teachers)
// student/parent → only receipts issued to themselves (via student_id)
export async function GET(request: NextRequest) {
  const caller = await requireCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = admin
    .from('receipts')
    .select('*, portal_users:student_id(full_name, email), schools:school_id(name)')
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (caller.role === 'admin') {
    const schoolIdParam = searchParams.get('school_id');
    if (schoolIdParam) query = query.eq('school_id', schoolIdParam);
  } else if ((caller.role === 'school' || caller.role === 'teacher') && caller.school_id) {
    query = query.eq('school_id', caller.school_id);
  } else {
    // student / parent: only their own receipts
    query = query.eq('student_id', caller.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/receipts — save a receipt
export async function POST(request: NextRequest) {
  const caller = await requireCaller();
  if (!caller || (caller.role !== 'admin' && caller.role !== 'teacher')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const {
    student_id,
    school_id,
    amount,
    currency,
    transaction_id,
    metadata,
  } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount is required' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('receipts')
    .insert([{
      student_id: student_id || null,
      school_id: school_id || null,
      amount: parseFloat(amount),
      currency: currency || 'NGN',
      transaction_id: transaction_id || null,
      metadata: metadata || {},
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
