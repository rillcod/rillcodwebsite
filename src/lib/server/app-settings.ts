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
