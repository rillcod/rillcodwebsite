import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCrmPlatformRole } from '@/lib/server/api-rbac';
import { assertCrmContactAccess, normalizeCrmStage } from '@/lib/crm/scope';

async function requireCrmStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('id, role, full_name, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !isCrmPlatformRole(profile.role)) throw new Error('Forbidden');
  return { profile, db };
}

// GET /api/crm/contacts/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { profile, db } = await requireCrmStaff();
    const access = await assertCrmContactAccess(db, profile, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    if (access.kind === 'whatsapp') {
      const wa = access.row;
      return NextResponse.json({
        contact: {
          id: wa.id,
          full_name: wa.contact_name || wa.phone_number,
          phone: wa.phone_number,
          role: 'external',
          source: 'whatsapp',
          last_message_at: wa.last_message_at,
          created_at: wa.created_at,
          _type: 'external',
        },
        pipeline: null,
        interaction_count: 0,
        task_summary: { open: 0, overdue: 0, completed: 0 },
        opportunity_summary: { count: 0, total_value: 0 },
        recent_interactions: [],
        children: [],
      });
    }

    if (access.kind === 'book') {
      const book = access.row;
      const nowIso = new Date().toISOString();
      const [pipelineRes, interactionsRes, tasksRes, opportunitiesRes] = await Promise.all([
        db.from('crm_pipeline').select('stage, pipeline_notes, updated_by_name, updated_at').eq('contact_id', id).maybeSingle(),
        db.from('crm_interactions').select('id, type, direction, content, staff_name, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(5),
        db.from('crm_tasks').select('id, status, due_at').eq('contact_id', id),
        db.from('crm_opportunities').select('id, stage, estimated_value').eq('contact_id', id),
      ]);

      const allTasks: any[] = tasksRes.data || [];
      const allOpps: any[] = opportunitiesRes.data || [];
      const activeOpps = allOpps.filter((o) => o.stage !== 'lost');
      const meta = (book.metadata || {}) as Record<string, unknown>;
      const childrenMeta = Array.isArray(meta.children) ? meta.children : [];

      const pipeline = pipelineRes.data
        ? { ...pipelineRes.data, stage: normalizeCrmStage((pipelineRes.data as any).stage) }
        : null;

      return NextResponse.json({
        contact: {
          id: book.id,
          full_name: book.full_name,
          email: book.email,
          phone: book.phone,
          role: 'lead',
          school_name: book.school_name,
          school_id: access.schoolId,
          section_class: book.class_name,
          is_active: true,
          created_at: book.created_at,
          updated_at: book.updated_at,
          metadata: book.metadata,
          source: book.source || 'contact_book',
          _type: 'book',
        },
        pipeline,
        interaction_count: (interactionsRes.data || []).length,
        task_summary: {
          open: allTasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
          overdue: allTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date(nowIso) && t.status !== 'completed').length,
          completed: allTasks.filter((t) => t.status === 'completed').length,
        },
        opportunity_summary: {
          count: activeOpps.length,
          total_value: activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0),
        },
        recent_interactions: interactionsRes.data || [],
        children: childrenMeta.map((c: any, i: number) => ({
          id: `book-child-${i}`,
          full_name: c.name,
          school_name: c.school || book.school_name,
          grade_level: c.class,
          section_class: c.class,
          relationship: 'child',
        })),
      });
    }

    const contact = access.row;
    const nowIso = new Date().toISOString();
    const parentEmail = contact.role === 'parent' ? (contact.email as string | null) : null;

    // Children enrichment — school-scoped for non-admins
    let childrenQuery = parentEmail
      ? db.from('students')
          .select('id, full_name, school_name, school_id, grade_level, section_class, current_class, user_id, parent_relationship')
          .ilike('parent_email', parentEmail)
          .order('full_name')
      : null;

    if (childrenQuery && profile.role === 'teacher' && access.schoolId) {
      childrenQuery = childrenQuery.eq('school_id', access.schoolId) as any;
    } else if (childrenQuery && profile.role === 'teacher' && profile.school_id) {
      childrenQuery = childrenQuery.eq('school_id', profile.school_id) as any;
    }

    const [pipelineRes, interactionsRes, tasksRes, opportunitiesRes, childrenRes] = await Promise.all([
      db.from('crm_pipeline').select('stage, pipeline_notes, updated_by_name, updated_at').eq('contact_id', id).maybeSingle(),
      db.from('crm_interactions').select('id, type, direction, content, staff_name, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(5),
      db.from('crm_tasks').select('id, status, due_at').eq('contact_id', id),
      db.from('crm_opportunities').select('id, stage, estimated_value').eq('contact_id', id),
      childrenQuery ? childrenQuery : Promise.resolve({ data: [] }),
    ]);

    const allTasks: any[] = tasksRes.data || [];
    const allOpps: any[] = opportunitiesRes.data || [];
    const activeOpps = allOpps.filter((o) => o.stage !== 'lost');
    const pipeline = pipelineRes.data
      ? { ...pipelineRes.data, stage: normalizeCrmStage((pipelineRes.data as any).stage) }
      : null;

    return NextResponse.json({
      contact: { ...contact, _type: 'portal_user' },
      pipeline,
      interaction_count: (interactionsRes.data || []).length,
      task_summary: {
        open: allTasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
        overdue: allTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date(nowIso) && t.status !== 'completed').length,
        completed: allTasks.filter((t) => t.status === 'completed').length,
      },
      opportunity_summary: {
        count: activeOpps.length,
        total_value: activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0),
      },
      recent_interactions: interactionsRes.data || [],
      children: ((childrenRes as any).data || []).map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        school_name: s.school_name,
        school_id: s.school_id,
        grade_level: s.grade_level,
        section_class: s.section_class || s.current_class,
        relationship: s.parent_relationship,
        user_id: s.user_id,
      })),
    });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}

// PATCH /api/crm/contacts/[id]
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { profile, db } = await requireCrmStaff();
    const access = await assertCrmContactAccess(db, profile, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json();
    const { full_name, email, phone, school_name, section_class, bio, tags, notes, role } = body;

    if (access.kind === 'book') {
      const meta = { ...((access.row.metadata as Record<string, unknown>) || {}) };
      if (tags !== undefined) meta.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t: string) => t.trim()).filter(Boolean);
      if (notes !== undefined) meta.notes = notes;
      const { data, error } = await db.from('customer_contact_book').update({
        ...(full_name !== undefined && { full_name: String(full_name).trim() }),
        ...(email !== undefined && { email: String(email).trim().toLowerCase() || null }),
        ...(phone !== undefined && { phone: String(phone).trim() || null }),
        ...(school_name !== undefined && { school_name: String(school_name).trim() || null }),
        ...(section_class !== undefined && { class_name: String(section_class).trim() || null }),
        metadata: meta,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        contact: {
          ...data,
          role: 'lead',
          section_class: data.class_name,
          _type: 'book',
        },
      });
    }

    if (access.kind !== 'portal') {
      return NextResponse.json({ error: 'This contact type cannot be edited here' }, { status: 400 });
    }

    // Teachers cannot reassign school_id via body — keep existing school.
    let metadataUpdate: Record<string, unknown> | undefined;
    if (tags !== undefined || notes !== undefined) {
      const meta = { ...((access.row.metadata as Record<string, unknown>) || {}) };
      if (tags !== undefined) meta.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t: string) => t.trim()).filter(Boolean);
      if (notes !== undefined) meta.notes = notes;
      metadataUpdate = meta;
    }

    const { data, error } = await (db as any).from('portal_users').update({
      ...(full_name !== undefined && { full_name: String(full_name).trim() }),
      ...(email !== undefined && { email: String(email).trim().toLowerCase() || null }),
      ...(phone !== undefined && { phone: String(phone).trim() || null }),
      ...(school_name !== undefined && { school_name: String(school_name).trim() || null }),
      ...(section_class !== undefined && { section_class: String(section_class).trim() || null }),
      ...(bio !== undefined && { bio: String(bio).trim() || null }),
      ...(role !== undefined && profile.role === 'admin' && { role }),
      ...(metadataUpdate !== undefined && { metadata: metadataUpdate }),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}

// DELETE /api/crm/contacts/[id] — soft-delete portal contacts only (admin)
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { profile, db } = await requireCrmStaff();
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can remove contacts' }, { status: 403 });
    }

    const access = await assertCrmContactAccess(db, profile, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    if (access.kind === 'portal') {
      const { error } = await db.from('portal_users').update({
        is_active: false,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (access.kind === 'book') {
      const { error } = await db.from('customer_contact_book').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: 'Cannot remove this contact type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}
