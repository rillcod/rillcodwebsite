import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role, full_name, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return data;
}

// GET /api/crm/opportunities?contact_id=&stage=
export async function GET(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const contact_id = url.searchParams.get('contact_id');
  const stage = url.searchParams.get('stage');

  let q = adminClient()
    .from('crm_opportunities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (contact_id) q = q.eq('contact_id', contact_id);
  if (stage) q = q.eq('stage', stage);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data ?? [] });
}

// POST /api/crm/opportunities — create
export async function POST(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const {
    contact_id, contact_name, stage = 'lead',
    estimated_value, expected_close_at, close_probability, notes, source,
  } = body;

  if (!contact_id || !contact_name) {
    return NextResponse.json({ error: 'contact_id and contact_name are required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await adminClient()
    .from('crm_opportunities')
    .insert({
      contact_id,
      contact_name,
      stage,
      estimated_value: estimated_value ?? null,
      expected_close_at: expected_close_at ?? null,
      close_probability: close_probability ?? null,
      notes: notes ?? null,
      source: source ?? null,
      owner_id: caller.id,
      owner_name: (caller as any).full_name ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunity: data }, { status: 201 });
}

// PATCH /api/crm/opportunities — update
export async function PATCH(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { id, stage, estimated_value, expected_close_at, close_probability, notes, source } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data, error } = await (adminClient() as any)
    .from('crm_opportunities')
    .update({
      ...(stage !== undefined && { stage }),
      ...(estimated_value !== undefined && { estimated_value }),
      ...(expected_close_at !== undefined && { expected_close_at: expected_close_at || null }),
      ...(close_probability !== undefined && { close_probability }),
      ...(notes !== undefined && { notes }),
      ...(source !== undefined && { source }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunity: data });
}

// DELETE /api/crm/opportunities?id=xxx
export async function DELETE(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await adminClient().from('crm_opportunities').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
