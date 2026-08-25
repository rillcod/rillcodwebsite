import { describe, expect, it } from "vitest";
import {
  PLATFORM_CONFIGURATION_KEYS,
  isAllowedAppSettingMutationKey,
  isPlatformConfigurationKey,
  isRuntimeEnvPlatformSecret,
  isSensitivePlatformSetting,
  normalizePlatformSetting,
  PLATFORM_CONFIGURATION_SECTION_KEYS,
} from "./platform-settings";

describe("platform configuration ownership", () => {
  it("does not expose runtime or learner workflow state as platform config", () => {
    expect(PLATFORM_CONFIGURATION_KEYS).not.toContain(
      "cron_academic_readiness_last_fanout"
    );
    expect(
      isPlatformConfigurationKey(
        "progression.path_visibility.class.some-class"
      )
    ).toBe(false);
  });

  it("keeps AI credentials write-only", () => {
    expect(isSensitivePlatformSetting("openrouter_api_key")).toBe(true);
    expect(isSensitivePlatformSetting("brand_primary_color")).toBe(false);
    expect(isAllowedAppSettingMutationKey("openrouter_api_key")).toBe(false);
    expect(isAllowedAppSettingMutationKey("gemini_api_key")).toBe(false);
    expect(isRuntimeEnvPlatformSecret("openrouter_api_key")).toBe(true);
  });

  it("preserves the validated finance compatibility mutation", () => {
    expect(
      isAllowedAppSettingMutationKey("default_registration_program_id")
    ).toBe(true);
  });

  it("gives each platform setting exactly one owner", () => {
    const owned = Object.values(PLATFORM_CONFIGURATION_SECTION_KEYS).flat();
    expect(new Set(owned).size).toBe(PLATFORM_CONFIGURATION_KEYS.length);
    expect(owned.sort()).toEqual([...PLATFORM_CONFIGURATION_KEYS].sort());
  });

  it("normalizes supported values and rejects unsafe or ambiguous values", () => {
    expect(normalizePlatformSetting("lms_attendance_threshold", " 80 ")).toEqual({ ok: true, value: "80" });
    expect(normalizePlatformSetting("lms_attendance_threshold", "101").ok).toBe(false);
    expect(normalizePlatformSetting("pollinations_enabled", "yes").ok).toBe(false);
    expect(normalizePlatformSetting("platform_logo_url", "http://example.com/logo.png").ok).toBe(false);
    expect(normalizePlatformSetting("brand_primary_color", "blue").ok).toBe(false);
    expect(normalizePlatformSetting("ai_free_models", " a, b, a ")).toEqual({ ok: true, value: "a,b" });
  });
});
