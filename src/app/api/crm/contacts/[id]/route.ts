import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCrmPlatformRole } from '@/lib/server/api-rbac';

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
// Returns the full enriched contact: portal_users row + pipeline stage + interaction count
// + task summary + opportunity summary + recent timeline items.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { db } = await requireCrmStaff();

    // Base contact row
    const { data: contact, error: contactErr } = await db
      .from('portal_users')
      .select(
        'id, full_name, email, phone, role, school_name, school_id, section_class, ' +
        'is_active, created_at, updated_at, metadata, bio, date_of_birth, student_id, class_id',
      )
      .eq('id', id)
      .maybeSingle();

    if (contactErr || !contact) {
      // Try whatsapp_conversations for external contacts
      const { data: waContact } = await (db as any)
        .from('whatsapp_conversations')
        .select('id, contact_name, phone_number, last_message_at, created_at')
        .eq('id', id)
        .maybeSingle();

      if (!waContact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }

      return NextResponse.json({
        contact: {
          id: waContact.id,
          full_name: waContact.contact_name || waContact.phone_number,
          phone: waContact.phone_number,
          role: 'external',
          source: 'whatsapp',
          last_message_at: waContact.last_message_at,
          created_at: waContact.created_at,
          _type: 'external',
        },
        pipeline: null,
        interaction_count: 0,
        task_summary: { open: 0, overdue: 0, completed: 0 },
        opportunity_summary: { count: 0, total_value: 0 },
        recent_interactions: [],
      });
    }

    // Run enrichment queries in parallel
    const nowIso = new Date().toISOString();
    const [pipelineRes, interactionsRes, tasksRes, opportunitiesRes] = await Promise.all([
      db.from('crm_pipeline').select('stage, pipeline_notes, updated_by_name, updated_at').eq('contact_id', id).maybeSingle(),
      (db as any).from('crm_interactions').select('id, type, direction, content, staff_name, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(5),
      (db as any).from('crm_tasks').select('id, status, due_at').eq('contact_id', id),
      (db as any).from('crm_opportunities').select('id, stage, estimated_value').eq('contact_id', id),
    ]);

    // Task summary
    const allTasks: { id: string; status: string; due_at: string | null }[] = tasksRes.data || [];
    const task_summary = {
      open: allTasks.filter(t => t.status === 'open' || t.status === 'in_progress').length,
      overdue: allTasks.filter(t => t.due_at && new Date(t.due_at) < new Date(nowIso) && t.status !== 'completed').length,
      completed: allTasks.filter(t => t.status === 'completed').length,
    };

    // Opportunity summary
    const allOpps: { id: string; stage: string; estimated_value: number | null }[] = opportunitiesRes.data || [];
    const activeOpps = allOpps.filter(o => o.stage !== 'lost');
    const opportunity_summary = {
      count: activeOpps.length,
      total_value: activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0),
    };

    return NextResponse.json({
      contact: { ...(contact as unknown as Record<string, unknown>), _type: 'portal_user' },
      pipeline: pipelineRes.data ?? null,
      interaction_count: (interactionsRes.data || []).length,
      task_summary,
      opportunity_summary,
      recent_interactions: interactionsRes.data || [],
    });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}

// PATCH /api/crm/contacts/[id]
// Partial update: any subset of name, email, phone, school, section_class, bio, metadata tags/notes.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { db } = await requireCrmStaff();
    const body = await req.json();

    const { full_name, email, phone, school_name, section_class, bio, tags, notes, role } = body;

    let metadataUpdate: Record<string, unknown> | undefined;
    if (tags !== undefined || notes !== undefined) {
      const { data: existing } = await db.from('portal_users').select('metadata').eq('id', id).maybeSingle();
      const meta = (((existing as any)?.metadata) || {}) as Record<string, unknown>;
      if (tags !== undefined) meta.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t: string) => t.trim()).filter(Boolean);
      if (notes !== undefined) meta.notes = notes;
      metadataUpdate = meta;
    }

    const { data, error } = await (db as any).from('portal_users').update({
      ...(full_name !== undefined  && { full_name: String(full_name).trim() }),
      ...(email !== undefined      && { email: String(email).trim().toLowerCase() || null }),
      ...(phone !== undefined      && { phone: String(phone).trim() || null }),
      ...(school_name !== undefined && { school_name: String(school_name).trim() || null }),
      ...(section_class !== undefined && { section_class: String(section_class).trim() || null }),
      ...(bio !== undefined        && { bio: String(bio).trim() || null }),
      ...(role !== undefined       && { role }),
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

// DELETE /api/crm/contacts/[id]
// Soft-delete: sets is_active = false so the contact disappears from CRM lists
// but their data and links are preserved. Hard-delete requires admin + separate confirmation.
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

    const { error } = await db.from('portal_users').update({
      is_active: false,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}
