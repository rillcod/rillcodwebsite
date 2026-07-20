import { NextRequest, NextResponse } from 'next/server';
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
    const controls = parseOfficeAutomationControls({ ...current, ...patch });
    const now = new Date().toISOString();
    const { error } = await actor.db.from('system_settings').update({
      setting_value: JSON.stringify(controls),
      updated_at: now,
    }).eq('setting_key', OFFICE_AUTOMATION_SETTING_KEY);
    if (error) throw new Error(error.message);

    await actor.db.from('audit_logs').insert({
      user_id: actor.user.id,
      actor_id: actor.user.id,
      action: 'office_automation_controls_updated',
      table_name: 'system_settings',
      resource_type: 'system_settings',
      new_values: { changed: patch, resulting_controls: controls },
      created_at: now,
    } as any);

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
