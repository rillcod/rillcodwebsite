import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/** Read a boolean app setting; returns the default if unset or unreadable. */
export async function getBoolSetting(admin: AnySupabase, key: string, defaultValue: boolean): Promise<boolean> {
  try {
    const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
    if (!data) return defaultValue;
    return (data as { value?: string }).value === 'true';
  } catch {
    return defaultValue;
  }
}

/**
 * "Show progress-report indicator" — when off, the report status badges/dots/coverage widget are
 * suppressed everywhere, giving admins full control over when the indicator appears. Default ON.
 */
export const isReportIndicatorEnabled = (admin: AnySupabase) => getBoolSetting(admin, 'show_report_indicator', true);

/**
 * Paste-names claim — sensitive: lets admins/teachers force-claim existing students into a class
 * (including kids currently under another teacher). Default OFF; admin enables in LMS Settings.
 */
export const isPasteClaimEnabled = (admin: AnySupabase) => getBoolSetting(admin, 'allow_paste_claim_students', false);
