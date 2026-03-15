import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireUploader() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'teacher')) return null;
  return profile;
}

// POST /api/files/external — register an external URL as a files record
export async function POST(request: NextRequest) {
  const caller = await requireUploader();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { url, title, contentType } = body;

  if (!url?.trim()) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('files')
    .insert([{
      school_id: caller.school_id || null,
      uploaded_by: caller.id,
      filename: title || url,
      original_filename: title || url,
      file_type: contentType || 'other',
      file_size: 0,
      mime_type: 'text/url',
      storage_path: url,
      storage_provider: 'cloudinary',
      public_url: url,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
