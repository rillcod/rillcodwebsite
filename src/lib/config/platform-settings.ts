/** Settings owned by Platform Configuration — not cron state or workflow data. */
export const PLATFORM_CONFIGURATION_KEYS = [
  "openrouter_api_key",
  "gemini_api_key",
  "pollinations_enabled",
  "ai_free_models",
  "brand_primary_color",
  "platform_logo_url",
  "lms_teacher_isolation",
  "lms_auto_portals",
  "lms_gamification_enabled",
  "lms_auto_certificates",
  "lms_course_locking",
  "show_report_indicator",
  "allow_paste_claim_students",
  "lms_messaging_policy",
  "lms_attendance_threshold",
  "data_cleanup_policy",
] as const;

export type PlatformConfigurationKey =
  (typeof PLATFORM_CONFIGURATION_KEYS)[number];

const PLATFORM_CONFIGURATION_KEY_SET = new Set<string>(
  PLATFORM_CONFIGURATION_KEYS
);

/** Backward-compatible workflow mutations accepted by the shared API. */
const WORKFLOW_OWNED_APP_SETTING_KEYS = new Set<string>([
  "default_registration_program_id",
]);

export const SENSITIVE_PLATFORM_SETTING_KEYS = [
  "openrouter_api_key",
  "gemini_api_key",
] as const;

const SENSITIVE_PLATFORM_SETTING_KEY_SET = new Set<string>(
  SENSITIVE_PLATFORM_SETTING_KEYS
);

export function isPlatformConfigurationKey(
  key: string
): key is PlatformConfigurationKey {
  return PLATFORM_CONFIGURATION_KEY_SET.has(key);
}

export function isAllowedAppSettingMutationKey(key: string): boolean {
  return (
    PLATFORM_CONFIGURATION_KEY_SET.has(key) ||
    WORKFLOW_OWNED_APP_SETTING_KEYS.has(key)
  );
}

export function isSensitivePlatformSetting(key: string): boolean {
  return SENSITIVE_PLATFORM_SETTING_KEY_SET.has(key);
}
