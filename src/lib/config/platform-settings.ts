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

export type PlatformConfigurationSection = "ai" | "experience";

type SettingDefinition = {
  section: PlatformConfigurationSection;
  kind: "boolean" | "integer" | "enum" | "text" | "secret" | "color" | "url";
  defaultValue: string;
  allowed?: readonly string[];
  min?: number;
  max?: number;
};

/**
 * The canonical contract for every app-wide setting. UI labels may evolve, but
 * validation, defaults and ownership must not be redefined at individual call sites.
 */
export const PLATFORM_SETTING_DEFINITIONS: Record<
  PlatformConfigurationKey,
  SettingDefinition
> = {
  openrouter_api_key: { section: "ai", kind: "secret", defaultValue: "" },
  gemini_api_key: { section: "ai", kind: "secret", defaultValue: "" },
  pollinations_enabled: { section: "ai", kind: "boolean", defaultValue: "false" },
  ai_free_models: { section: "ai", kind: "text", defaultValue: "" },
  brand_primary_color: { section: "experience", kind: "color", defaultValue: "#1A3A8F" },
  platform_logo_url: { section: "experience", kind: "url", defaultValue: "" },
  lms_teacher_isolation: { section: "experience", kind: "boolean", defaultValue: "false" },
  lms_auto_portals: { section: "experience", kind: "boolean", defaultValue: "true" },
  lms_gamification_enabled: { section: "experience", kind: "boolean", defaultValue: "true" },
  lms_auto_certificates: { section: "experience", kind: "boolean", defaultValue: "false" },
  lms_course_locking: { section: "experience", kind: "boolean", defaultValue: "true" },
  show_report_indicator: { section: "experience", kind: "boolean", defaultValue: "true" },
  allow_paste_claim_students: { section: "experience", kind: "boolean", defaultValue: "false" },
  lms_messaging_policy: {
    section: "experience",
    kind: "enum",
    defaultValue: "open",
    allowed: ["open", "support_only", "restricted"],
  },
  lms_attendance_threshold: {
    section: "experience",
    kind: "integer",
    defaultValue: "75",
    min: 0,
    max: 100,
  },
  data_cleanup_policy: {
    section: "experience",
    kind: "enum",
    defaultValue: "flexible",
    allowed: ["flexible", "standard", "strict"],
  },
};

export const PLATFORM_CONFIGURATION_SECTION_KEYS: Record<
  PlatformConfigurationSection,
  readonly PlatformConfigurationKey[]
> = {
  ai: PLATFORM_CONFIGURATION_KEYS.filter(
    (key) => PLATFORM_SETTING_DEFINITIONS[key].section === "ai"
  ),
  experience: PLATFORM_CONFIGURATION_KEYS.filter(
    (key) => PLATFORM_SETTING_DEFINITIONS[key].section === "experience"
  ),
};

export function normalizePlatformSetting(
  key: PlatformConfigurationKey,
  rawValue: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof rawValue !== "string") {
    return { ok: false, error: `${key.replace(/_/g, " ")} must be text` };
  }
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  const value = rawValue.trim();
  if (value.length > 4096) {
    return { ok: false, error: `${key.replace(/_/g, " ")} is too long` };
  }
  if (definition.kind === "boolean" && !["true", "false"].includes(value)) {
    return { ok: false, error: `${key.replace(/_/g, " ")} must be on or off` };
  }
  if (definition.kind === "integer") {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < (definition.min ?? Number.MIN_SAFE_INTEGER) || parsed > (definition.max ?? Number.MAX_SAFE_INTEGER)) {
      return { ok: false, error: `${key.replace(/_/g, " ")} must be a whole number from ${definition.min} to ${definition.max}` };
    }
    return { ok: true, value: String(parsed) };
  }
  if (definition.kind === "enum" && !definition.allowed?.includes(value)) {
    return { ok: false, error: `${key.replace(/_/g, " ")} has an unsupported option` };
  }
  if (definition.kind === "color" && !/^#[0-9a-f]{6}$/i.test(value)) {
    return { ok: false, error: "Brand color must be a six-digit hex colour such as #1A3A8F" };
  }
  if (definition.kind === "url" && value) {
    if (!value.startsWith("/")) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") throw new Error("not https");
      } catch {
        return { ok: false, error: "Platform logo must be an HTTPS URL or an app-relative path" };
      }
    }
  }
  if (key === "ai_free_models") {
    const models = value.split(",").map((model) => model.trim()).filter(Boolean);
    if (models.length > 20) return { ok: false, error: "AI fallback list supports at most 20 models" };
    return { ok: true, value: Array.from(new Set(models)).join(",") };
  }
  return { ok: true, value };
}

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

/** Provider keys live in process.env / Cloudflare, not in app_settings. */
export const RUNTIME_ENV_SECRET_KEYS = SENSITIVE_PLATFORM_SETTING_KEYS;

const SENSITIVE_PLATFORM_SETTING_KEY_SET = new Set<string>(
  SENSITIVE_PLATFORM_SETTING_KEYS
);

const RUNTIME_ENV_SECRET_KEY_SET = new Set<string>(RUNTIME_ENV_SECRET_KEYS);

export function isPlatformConfigurationKey(
  key: string
): key is PlatformConfigurationKey {
  return PLATFORM_CONFIGURATION_KEY_SET.has(key);
}

export function isAllowedAppSettingMutationKey(key: string): boolean {
  if (RUNTIME_ENV_SECRET_KEY_SET.has(key)) return false;
  return (
    PLATFORM_CONFIGURATION_KEY_SET.has(key) ||
    WORKFLOW_OWNED_APP_SETTING_KEYS.has(key)
  );
}

export function isSensitivePlatformSetting(key: string): boolean {
  return SENSITIVE_PLATFORM_SETTING_KEY_SET.has(key);
}

export function isRuntimeEnvPlatformSecret(key: string): boolean {
  return RUNTIME_ENV_SECRET_KEY_SET.has(key);
}

export function runtimeEnvSecretIsConfigured(key: string): boolean {
  if (key === "openrouter_api_key") {
    return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  }
  if (key === "gemini_api_key") {
    return Boolean(
      process.env.GEMINI_API_KEY?.trim() ||
        process.env.GEMINI_API_KEY_2?.trim() ||
        process.env.GEMINI_API_KEY_3?.trim() ||
        process.env.GEMINI_API_KEY_4?.trim() ||
        process.env.GEMINI_API_KEY_5?.trim() ||
        process.env.GEMINI_API_KEYS?.trim()
    );
  }
  return false;
}
