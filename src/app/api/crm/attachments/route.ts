import { NextRequest, NextResponse } from 'next/server';
import { r2Upload, r2SignedUrl, r2Delete } from '@/lib/r2/client';
import { crmAuthErrorResponse, requireCrmStaff } from '@/lib/crm/auth';
import { assertCrmContactAccess } from '@/lib/crm/scope';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function GET(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const contact_id = new URL(req.url).searchParams.get('contact_id');
    if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

    const access = await assertCrmContactAccess(db, caller, contact_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const { data, error } = await db
      .from('crm_attachments')
      .select('*')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const withUrls = await Promise.all(
      (data || []).map(async (a: any) => {
        const signed = await r2SignedUrl(a.file_key, 3600, a.file_name).catch(() => '');
        return { ...a, signed_url: signed };
      }),
    );

    return NextResponse.json({ attachments: withUrls });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    const contact_id = formData.get('contact_id') as string;
    const contact_name = formData.get('contact_name') as string;
    const contact_type = (formData.get('contact_type') as string) || 'portal_user';

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (!contact_id) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 413 });

    const access = await assertCrmContactAccess(db, caller, contact_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'bin';
    const key = `crm/${contact_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    await r2Upload(key, buffer, file.type || 'application/octet-stream');

    const { data, error } = await db.from('crm_attachments').insert({
      contact_id,
      contact_type: contact_type || (access.kind === 'book' ? 'form_lead' : 'portal_user'),
      contact_name: contact_name || 'Unknown',
      file_name: file.name,
      file_key: key,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      uploaded_by: caller.id,
      uploaded_by_name: caller.full_name,
    }).select().single();

    if (error) {
      await r2Delete(key).catch(() => {});
      throw error;
    }

    const signed_url = await r2SignedUrl(key, 3600, file.name).catch(() => '');
    return NextResponse.json({ attachment: { ...data, signed_url } }, { status: 201 });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data, error } = await db.from('crm_attachments').select('file_key, contact_id').eq('id', id).single();
    if (error || !data) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

    const access = await assertCrmContactAccess(db, caller, data.contact_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    await r2Delete(data.file_key).catch(() => {});
    await db.from('crm_attachments').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}
