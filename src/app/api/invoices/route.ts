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
    .select('id, role, school_id, email')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return profile as { id: string; role: string; school_id: string | null; email: string | null };
}

async function requireWriter() {
  const caller = await requireCaller();
  if (!caller) return null;
  if (caller.role !== 'admin' && caller.role !== 'school') return null;
  return caller;
}

// GET /api/invoices — role-aware invoice listing.
//   admin  → all invoices (optional ?school_id= filter)
//   school → invoices scoped to their school_id
//   teacher→ invoices scoped to their school_id
//   student→ invoices where portal_user_id = self
//   parent → invoices for any of their children (students.parent_id = self)
//
// Accepts ?status=, ?limit= (default 100).
export async function GET(request: NextRequest) {
  const caller = await requireCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const stream = searchParams.get('stream'); // 'school' | 'individual'
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

  let query = admin
    .from('invoices')
    .select('*, portal_users(full_name, email), schools(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (stream === 'school' || stream === 'individual') {
    query = query.eq('stream', stream);
  }

  if (caller.role === 'admin') {
    const schoolIdParam = searchParams.get('school_id');
    if (schoolIdParam) query = query.eq('school_id', schoolIdParam);
  } else if ((caller.role === 'school' || caller.role === 'teacher') && caller.school_id) {
    query = query.eq('school_id', caller.school_id);
  } else if (caller.role === 'student') {
    query = query.eq('portal_user_id', caller.id);
  } else if (caller.role === 'parent') {
    if (!caller.email) return NextResponse.json({ data: [] });
    const { data: children } = await admin
      .from('students')
      .select('user_id')
      .eq('parent_email', caller.email);
    const childUserIds = (children ?? [])
      .map((c: any) => c.user_id)
      .filter((v: string | null): v is string => Boolean(v));
    if (childUserIds.length === 0) {
      return NextResponse.json({ data: [] });
    }
    query = query.in('portal_user_id', childUserIds);
  } else {
    return NextResponse.json({ data: [] });
  }

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/invoices — create invoice.
// Callers may pass an explicit `stream` ('school' | 'individual'); otherwise
// we classify from (school_id / portal_user_id / billing_cycle_id).
export async function POST(request: NextRequest) {
  const caller = await requireWriter();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    school_id, portal_user_id, amount, notes, due_date, items, status,
    stream: streamFromBody, billing_cycle_id,
  } = body;

  const { classifyInvoiceStream } = await import('@/lib/finance/streams');
  const stream = classifyInvoiceStream({
    stream: streamFromBody ?? null,
    school_id: school_id ?? null,
    portal_user_id: portal_user_id ?? null,
    billing_cycle_id: billing_cycle_id ?? null,
  });

  const admin = adminClient();
  const { data, error } = await admin
    .from('invoices')
    .insert([{
      school_id: school_id || null,
      portal_user_id: portal_user_id || null,
      amount: parseFloat(amount) || 0,
      notes: notes || null,
      due_date: due_date || null,
      items: items || [],
      status: status || 'sent',
      stream,
      billing_cycle_id: billing_cycle_id || null,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
