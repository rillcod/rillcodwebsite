import { describe, expect, it } from "vitest";
import {
  PLATFORM_CONFIGURATION_KEYS,
  isAllowedAppSettingMutationKey,
  isPlatformConfigurationKey,
  isSensitivePlatformSetting,
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
  });

  it("preserves the validated finance compatibility mutation", () => {
    expect(
      isAllowedAppSettingMutationKey("default_registration_program_id")
    ).toBe(true);
  });
});
