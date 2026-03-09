import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/portal-users — admin/staff only, returns all portal users (bypasses RLS)
export async function GET(request: NextRequest) {
  try {
    // Verify caller is admin or teacher via their session
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: caller } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }

    // Fetch all portal users with service role (no RLS restriction)
    const { data, error } = await adminClient()
      .from('portal_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// This API route creates a portal user with admin privileges using the service role key
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { id, email, full_name, role, is_active } = body;

    if (!id || !email || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create or update portal user with admin privileges bypassing RLS
    const { data, error } = await supabaseAdmin
      .from('portal_users')
      .upsert({ id, email: email.trim().toLowerCase(), full_name, role, is_active, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
