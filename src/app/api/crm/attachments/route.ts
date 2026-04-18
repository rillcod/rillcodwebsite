import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { r2Upload, r2SignedUrl, r2Delete } from '@/lib/r2/client';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  const db = createAdminClient();
  const { data: profile } = await db.from('portal_users').select('id, role, full_name, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) throw new Error('Forbidden');
  return { profile, db };
}

// GET /api/crm/attachments?contact_id=xxx
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireStaff();
    const contact_id = new URL(req.url).searchParams.get('contact_id');
    if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

    const { data, error } = await db
      .from('crm_attachments')
      .select('*')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Generate fresh signed URLs for each attachment
    const withUrls = await Promise.all(
      (data || []).map(async (a: any) => {
        const signed = await r2SignedUrl(a.file_key, 3600, a.file_name).catch(() => '');
        return { ...a, signed_url: signed };
      })
    );

    return NextResponse.json({ attachments: withUrls });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : e.message === 'Forbidden' ? 403 : 500 });
  }
}

// POST /api/crm/attachments  (multipart/form-data)
export async function POST(req: NextRequest) {
  try {
    const { profile, db } = await requireStaff();
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    const contact_id = formData.get('contact_id') as string;
    const contact_name = formData.get('contact_name') as string;
    const contact_type = (formData.get('contact_type') as string) || 'portal_user';

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (!contact_id) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'bin';
    const key = `crm/${contact_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    await r2Upload(key, buffer, file.type || 'application/octet-stream');

    const { data, error } = await db.from('crm_attachments').insert({
      contact_id, contact_type, contact_name: contact_name || 'Unknown',
      file_name: file.name, file_key: key,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      uploaded_by: profile.id, uploaded_by_name: profile.full_name,
    }).select().single();

    if (error) {
      await r2Delete(key).catch(() => {});
      throw error;
    }

    const signed_url = await r2SignedUrl(key, 3600, file.name).catch(() => '');
    return NextResponse.json({ attachment: { ...data, signed_url } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : e.message === 'Forbidden' ? 403 : 500 });
  }
}

// DELETE /api/crm/attachments?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { db } = await requireStaff();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data, error } = await db.from('crm_attachments').select('file_key').eq('id', id).single();
    if (error || !data) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

    await r2Delete(data.file_key).catch(() => {});
    await db.from('crm_attachments').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
