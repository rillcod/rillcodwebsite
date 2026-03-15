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

// POST /api/portfolio-projects — create project
export async function POST(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { title, description, category, tags, project_url, image_url } = body;

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('portfolio_projects')
    .insert({
      user_id: caller.id,
      title: title.trim(),
      description: description?.trim() || null,
      category: category || 'Coding',
      tags: Array.isArray(tags) ? tags : [],
      project_url: project_url?.trim() || null,
      image_url: image_url?.trim() || null,
      is_featured: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
