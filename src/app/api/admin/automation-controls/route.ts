import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadOfficeAutomationControls,
  OFFICE_AUTOMATION_SETTING_KEY,
  parseOfficeAutomationControls,
  type OfficeAutomationControls,
} from '@/lib/communication/automation-controls';
import { getWhatsAppCloudApiMode, isWhatsAppCloudApiApproved } from '@/lib/whatsapp/approval';
import { brandContact } from '@/config/brand';

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: profile } = await db.from('portal_users').select('role,is_active,is_deleted').eq('id', user.id).maybeSingle();
  return profile?.role === 'admin' && profile.is_active && !profile.is_deleted ? { user, db } : null;
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  try {
    return NextResponse.json({
      controls: await loadOfficeAutomationControls(actor.db as any),
      channels: {
        whatsappApiApproved: isWhatsAppCloudApiApproved(),
        whatsappApiMode: getWhatsAppCloudApiMode(),
        manualWhatsAppUrl: brandContact.whatsapp,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Controls unavailable' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const current = await loadOfficeAutomationControls(actor.db as any);
    const body = await req.json().catch(() => ({}));
    const allowed = Object.keys(current) as Array<keyof OfficeAutomationControls>;
    const patch: Partial<OfficeAutomationControls> = {};
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `${key} must be true or false.` }, { status: 400 });
      }
      patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Supply at least one automation control to change.' }, { status: 400 });
    }
    const controls = parseOfficeAutomationControls({ ...current, ...patch });
    const now = new Date().toISOString();
    const { data: saved, error } = await actor.db.from('system_settings').update({
      setting_value: JSON.stringify(controls),
      updated_at: now,
    }).eq('setting_key', OFFICE_AUTOMATION_SETTING_KEY).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error('Office automation controls are missing; no setting was changed.');

    await logAudit(actor.db, {
      action: 'office_automation_controls_updated',
      actorId: actor.user.id,
      tableName: 'system_settings',
      resourceType: 'system_settings',
      oldValues: { controls: current },
      newValues: { changed: patch, resulting_controls: controls },
    });

    return NextResponse.json({
      success: true,
      controls,
      channels: {
        whatsappApiApproved: isWhatsAppCloudApiApproved(),
        whatsappApiMode: getWhatsAppCloudApiMode(),
        manualWhatsAppUrl: brandContact.whatsapp,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save controls' }, { status: 500 });
  }
}
