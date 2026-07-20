import type { SupabaseClient } from '@supabase/supabase-js';

export const OFFICE_AUTOMATION_SETTING_KEY = 'office_automation_controls';

export interface OfficeAutomationControls {
  customer_followup_enabled: boolean;
  retention_streaks_enabled: boolean;
  marketing_enabled: boolean;
  lead_nurture_enabled: boolean;
  form_followup_enabled: boolean;
  newsletter_auto_publish_enabled: boolean;
}

export const DEFAULT_OFFICE_AUTOMATION_CONTROLS: OfficeAutomationControls = {
  customer_followup_enabled: true,
  retention_streaks_enabled: true,
  marketing_enabled: true,
  lead_nurture_enabled: true,
  form_followup_enabled: true,
  newsletter_auto_publish_enabled: true,
};

export function parseOfficeAutomationControls(value: unknown): OfficeAutomationControls {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); }
    catch { throw new Error('Office automation controls are invalid.'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Office automation controls are invalid.');
  }
  const raw = parsed as Record<string, unknown>;
  const controls = { ...DEFAULT_OFFICE_AUTOMATION_CONTROLS };
  for (const key of Object.keys(controls) as Array<keyof OfficeAutomationControls>) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean') {
      throw new Error(`Office automation control ${key} must be true or false.`);
    }
    if (typeof raw[key] === 'boolean') controls[key] = raw[key];
  }
  return controls;
}

export async function loadOfficeAutomationControls(db: SupabaseClient<any>): Promise<OfficeAutomationControls> {
  const { data, error } = await db
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', OFFICE_AUTOMATION_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(`Office automation controls unavailable: ${error.message}`);
  if (!data?.setting_value) throw new Error('Office automation controls are missing.');
  return parseOfficeAutomationControls(data.setting_value);
}
