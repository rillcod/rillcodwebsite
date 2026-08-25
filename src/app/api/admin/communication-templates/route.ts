import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildTemplateTestData,
  extractTemplateVariables,
  normalizeTemplateKey,
  renderCommunicationTemplate,
} from '@/lib/communication/template-registry';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseWrite } from '@/lib/supabase/require-result';

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('portal_users').select('role,is_active,is_deleted').eq('id', user.id).maybeSingle();
  return profile?.role === 'admin' && profile.is_active && !profile.is_deleted ? { user, db } : null;
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const [templates, versions] = await Promise.all([
    actor.db.from('communication_templates').select('*').order('category').order('name'),
    actor.db.from('communication_template_versions').select('*').order('version_number', { ascending: false }),
  ]);
  if (templates.error || versions.error) return NextResponse.json({ error: templates.error?.message || versions.error?.message }, { status: 500 });
  const templateRows = templates.data ?? [];
  const versionRows = versions.data ?? [];
  const actorIds = [...new Set([
    ...templateRows.flatMap((row: any) => [row.created_by, row.approved_by]),
    ...versionRows.map((row: any) => row.created_by),
  ].filter(Boolean))];
  const keys = [...new Set(templateRows.map((row: any) => row.template_key).filter(Boolean))];
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [peopleResult, deliveryResult, deadLetterResult] = await Promise.all([
    actorIds.length
      ? actor.db.from('portal_users').select('id,full_name').in('id', actorIds)
      : Promise.resolve({ data: [], error: null }),
    keys.length
      ? actor.db.from('communication_delivery_log').select('template_key,status,created_at,error')
          .in('template_key', keys).gte('created_at', since).order('created_at', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [], error: null }),
    actor.db.from('notification_dead_letters').select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'retrying']),
  ]);
  if (peopleResult.error || deliveryResult.error || deadLetterResult.error) {
    return NextResponse.json({
      error: peopleResult.error?.message || deliveryResult.error?.message || deadLetterResult.error?.message,
    }, { status: 500 });
  }
  const names = new Map((peopleResult.data ?? []).map((person: any) => [person.id, person.full_name || 'Unnamed administrator']));
  const deliveryByKey = new Map<string, { sent: number; failed: number; suppressed: number; lastStatus: string | null; lastAt: string | null; lastError: string | null }>();
  for (const row of deliveryResult.data ?? []) {
    const key = String(row.template_key || '');
    const current = deliveryByKey.get(key) ?? { sent: 0, failed: 0, suppressed: 0, lastStatus: null, lastAt: null, lastError: null };
    if (['sent', 'delivered', 'read'].includes(row.status)) current.sent += 1;
    else if (row.status === 'failed') current.failed += 1;
    else if (row.status === 'suppressed') current.suppressed += 1;
    if (!current.lastAt) {
      current.lastStatus = row.status;
      current.lastAt = row.created_at;
      current.lastError = row.error ?? null;
    }
    deliveryByKey.set(key, current);
  }
  return NextResponse.json({
    recoveryHref: '/dashboard/office?workspace=settings&section=health',
    pendingRecovery: deadLetterResult.count ?? 0,
    templates: templateRows.map((template: any) => ({
      ...template,
      createdByName: names.get(template.created_by) ?? null,
      approvedByName: names.get(template.approved_by) ?? null,
      delivery: deliveryByKey.get(template.template_key) ?? { sent: 0, failed: 0, suppressed: 0, lastStatus: null, lastAt: null, lastError: null },
      versions: versionRows
        .filter((version: any) => version.template_id === template.id)
        .map((version: any) => ({ ...version, createdByName: names.get(version.created_by) ?? null })),
      currentVersion: versionRows.find((version: any) => version.id === template.current_version_id) ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const now = new Date().toISOString();

  if (action === 'create') {
    const key = normalizeTemplateKey(String(body.templateKey || body.name || ''));
    const name = String(body.name || '').trim();
    const channel = String(body.channel || 'email');
    const templateBody = String(body.body || '').trim();
    const subject = String(body.subject || '').trim() || null;
    if (!key || !name || !templateBody) return NextResponse.json({ error: 'Key, name, and body are required.' }, { status: 400 });
    if (!['email', 'whatsapp', 'in_app', 'sms'].includes(channel)) return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
    const variables = extractTemplateVariables(subject, templateBody);
    const { data: template, error: templateError } = await actor.db.from('communication_templates').insert({
      template_key: key, name, description: String(body.description || '').trim() || null,
      category: String(body.category || 'operations'), channel, required_variables: variables,
      status: 'draft', created_by: actor.user.id, created_at: now, updated_at: now,
    }).select('*').single();
    if (templateError) return NextResponse.json({ error: templateError.message }, { status: templateError.code === '23505' ? 409 : 500 });
    const { data: version, error: versionError } = await actor.db.from('communication_template_versions').insert({
      template_id: template.id, version_number: 1, subject, body: templateBody,
      change_note: String(body.changeNote || 'Initial version'), created_by: actor.user.id,
    }).select('*').single();
    if (versionError) {
      try {
        await requireSupabaseWrite(
          actor.db.from('communication_templates').delete().eq('id', template.id),
          'Roll back incomplete communication template',
        );
      } catch (rollbackError) {
        return NextResponse.json({
          error: versionError.message,
          rollback_error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        }, { status: 500 });
      }
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }
    await logAudit(actor.db, {
      action: 'create_communication_template', actorId: actor.user.id,
      resourceType: 'communication_template', resourceId: template.id,
      tableName: 'communication_templates',
      newValue: `Created draft template ${name}`,
      newValues: { template_key: key, name, category: String(body.category || 'operations'), channel, version_id: version.id },
    });
    return NextResponse.json({ success: true, template, version });
  }

  if (action === 'new_version') {
    const templateId = String(body.templateId || '');
    const templateBody = String(body.body || '').trim();
    const subject = String(body.subject || '').trim() || null;
    if (!templateId || !templateBody) return NextResponse.json({ error: 'Template and body are required.' }, { status: 400 });
    const { data: template } = await actor.db.from('communication_templates').select('*').eq('id', templateId).maybeSingle();
    if (!template) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    const { data: latest } = await actor.db.from('communication_template_versions').select('version_number').eq('template_id', templateId).order('version_number', { ascending: false }).limit(1).maybeSingle();
    const { data: version, error } = await actor.db.from('communication_template_versions').insert({
      template_id: templateId, version_number: Number(latest?.version_number || 0) + 1,
      subject, body: templateBody, change_note: String(body.changeNote || 'Updated version'), created_by: actor.user.id,
    }).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(actor.db, {
      action: 'create_communication_template_version', actorId: actor.user.id,
      resourceType: 'communication_template', resourceId: templateId,
      tableName: 'communication_template_versions', recordId: version.id,
      newValue: `Created communication template version ${version.version_number}`,
      newValues: { version_id: version.id, version_number: version.version_number },
    });
    return NextResponse.json({ success: true, version });
  }

  const versionId = String(body.versionId || '');
  if (action === 'test') {
    const { data: version } = await actor.db.from('communication_template_versions').select('*').eq('id', versionId).maybeSingle();
    if (!version) return NextResponse.json({ error: 'Version not found.' }, { status: 404 });
    const variables = extractTemplateVariables(version.subject, version.body);
    let rendered: ReturnType<typeof renderCommunicationTemplate>;
    try {
      rendered = renderCommunicationTemplate({ subject: version.subject, body: version.body, requiredVariables: variables, data: buildTemplateTestData(variables) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await requireSupabaseWrite(
          actor.db.from('communication_template_versions').update({ test_status: 'failed', test_notes: message, tested_at: now }).eq('id', versionId),
          'Record failed communication template test',
        );
      } catch (writeError) {
        return NextResponse.json({ error: message, state_error: writeError instanceof Error ? writeError.message : String(writeError) }, { status: 500 });
      }
      await logAudit(actor.db, {
        action: 'test_communication_template_version_failed', actorId: actor.user.id,
        resourceType: 'communication_template_version', resourceId: versionId,
        newValue: message,
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
    try {
      await requireSupabaseWrite(
        actor.db.from('communication_template_versions').update({ test_status: 'passed', test_notes: 'All declared variables rendered without unresolved placeholders.', tested_at: now }).eq('id', versionId),
        'Record successful communication template test',
      );
    } catch (writeError) {
      return NextResponse.json({ error: writeError instanceof Error ? writeError.message : String(writeError) }, { status: 500 });
    }
    await logAudit(actor.db, {
      action: 'test_communication_template_version', actorId: actor.user.id,
      resourceType: 'communication_template_version', resourceId: versionId,
      newValue: 'Template rendering test passed',
    });
    return NextResponse.json({ success: true, rendered });
  }

  if (action === 'approve') {
    const { data: version } = await actor.db.from('communication_template_versions').select('*').eq('id', versionId).maybeSingle();
    if (!version) return NextResponse.json({ error: 'Version not found.' }, { status: 404 });
    if (version.test_status !== 'passed') return NextResponse.json({ error: 'The version must pass its template test before approval.' }, { status: 409 });
    const requiredVariables = extractTemplateVariables(version.subject, version.body);
    const { error } = await actor.db.from('communication_templates').update({ status: 'approved', current_version_id: version.id, required_variables: requiredVariables, approved_by: actor.user.id, approved_at: now, updated_at: now }).eq('id', version.template_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(actor.db, {
      action: 'approve_communication_template', actorId: actor.user.id,
      resourceType: 'communication_template', resourceId: version.template_id,
      newValue: `Approved version ${version.version_number}`,
      newValues: { current_version_id: version.id, version_number: version.version_number },
    });
    return NextResponse.json({ success: true, status: 'approved' });
  }

  if (action === 'retire') {
    const templateId = String(body.templateId || '');
    const { error } = await actor.db.from('communication_templates').update({ status: 'retired', updated_at: now }).eq('id', templateId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(actor.db, {
      action: 'retire_communication_template', actorId: actor.user.id,
      resourceType: 'communication_template', resourceId: templateId,
      newValue: 'Retired communication template',
    });
    return NextResponse.json({ success: true, status: 'retired' });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
