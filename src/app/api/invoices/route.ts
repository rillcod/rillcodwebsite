import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'school')) return null;
  return profile;
}

// POST /api/invoices — create invoice
export async function POST(request: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { school_id, portal_user_id, amount, notes, due_date, items, status } = body;

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
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
