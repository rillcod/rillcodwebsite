import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/schools/public
// Returns id + name for all approved schools — no auth required.
// Used by the signup page so students can select their school.
export async function GET() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await admin
    .from('schools')
    .select('id, name')
    .eq('status', 'approved')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schools: data ?? [] });
}
