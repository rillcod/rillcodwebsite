import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260929000113_harden_platform_configuration.sql"),
  "utf8"
).toLowerCase();

describe("platform configuration database boundary", () => {
  it("prevents browser clients from reading provider secrets", () => {
    expect(sql).toContain("key not in ('openrouter_api_key', 'gemini_api_key')");
    expect(sql).toContain("revoke insert, update, delete on table public.app_settings from authenticated");
  });

  it("does not treat stored provider keys as the runtime source", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/app-settings/route.ts"),
      "utf8"
    );
    expect(route).toContain("runtimeEnvSecretIsConfigured");
    expect(route).toContain("isRuntimeEnvPlatformSecret");
    expect(route).toContain("Saving here does not change what the models use");
  });

  it("allows only the service role to call the atomic updater", () => {
    expect(sql).toContain("revoke all on function public.update_platform_configuration(uuid, jsonb) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.update_platform_configuration(uuid, jsonb) to service_role");
  });

  it("locks settings and rejects stale admin state", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("errcode = '40001'");
    expect(sql).toContain("role = 'admin'");
    expect(sql).toContain("is_active = true");
    expect(sql).toContain("date_trunc('milliseconds'");
    expect(sql).toContain("order by value->>'key'");
  });
});
