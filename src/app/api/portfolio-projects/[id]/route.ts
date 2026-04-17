import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  return profile;
}

// PATCH /api/portfolio-projects/[id] — update project (own only)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'category', 'tags', 'project_url', 'image_url', 'is_featured'];
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  const admin = adminClient();
  // Enforce ownership: only update own projects
  const { data, error } = await admin
    .from('portfolio_projects')
    .update(update)
    .eq('id', id)
    .eq('user_id', caller.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/portfolio-projects/[id] — delete project (own only)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const admin = adminClient();
  const { error } = await admin
    .from('portfolio_projects')
    .delete()
    .eq('id', id)
    .eq('user_id', caller.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
