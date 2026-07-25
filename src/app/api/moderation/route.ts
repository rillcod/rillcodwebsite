import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id, full_name').eq('id', user.id).single();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return { ...user, role: data.role, school_id: data.school_id, full_name: data.full_name };
}

// GET /api/moderation — list flagged content & active discussions for review
export async function GET(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createAdminClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = db
    .from('flagged_content')
    .select('*, reporter:portal_users!flagged_content_reporter_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data: flagged, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let items = flagged ?? [];

  // Fallback: If no explicit user flags exist yet, load recent discussion topics for live moderation
  if (items.length === 0) {
    const { data: topics } = await db
      .from('discussion_topics')
      .select('id, title, content, created_at, created_by, portal_users!discussion_topics_created_by_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (topics && topics.length > 0) {
      items = topics.map((t: any) => ({
        id: `topic-${t.id}`,
        school_id: null,
        reporter_id: t.created_by,
        content_type: 'topic',
        content_id: t.id,
        reason: `Topic Title: ${t.title || 'General Discussion'}`,
        status: 'pending',
        moderator_id: null,
        moderator_notes: t.content || null,
        created_at: t.created_at,
        updated_at: t.created_at,
        reporter: t.portal_users || { full_name: 'Student User', email: '' },
      }));
    }
  }

  return NextResponse.json({ data: items });
}

// PATCH /api/moderation — resolve / dismiss / approve a flagged item
export async function PATCH(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, status, moderator_notes } = body;

  if (!id || !['resolved', 'dismissed', 'reviewed', 'removed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const db = createAdminClient();
  const dbStatus = status === 'resolved' ? 'reviewed' : status;

  if (String(id).startsWith('topic-')) {
    const realTopicId = String(id).replace('topic-', '');
    await logAudit(db, {
      action: `moderation_topic_${status}`,
      actorId: user.id,
      tableName: 'discussion_topics',
      recordId: realTopicId,
      newValues: { moderator_notes, status: dbStatus },
    });
    return NextResponse.json({ success: true });
  }

  const { error } = await db
    .from('flagged_content')
    .update({
      status: dbStatus,
      moderator_id: user.id,
      moderator_notes: moderator_notes || null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(db, {
    action: `moderation_${status}`,
    actorId: user.id,
    tableName: 'flagged_content',
    recordId: id,
    newValues: { moderator_notes, status: dbStatus },
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/moderation — remove inappropriate discussion topic / reply
export async function DELETE(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type') || 'topic';

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const db = createAdminClient();
  const realId = id.replace('topic-', '').replace('reply-', '');

  if (type === 'topic' || id.startsWith('topic-')) {
    await db.from('discussion_topics').delete().eq('id', realId);
  } else {
    await db.from('discussion_replies').delete().eq('id', realId);
  }

  await logAudit(db, {
    action: 'moderation_content_deleted',
    actorId: user.id,
    tableName: type === 'topic' ? 'discussion_topics' : 'discussion_replies',
    recordId: realId,
  });

  return NextResponse.json({ success: true });
}
