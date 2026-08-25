import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260929000116_public_can_see_rillcod_bank_accounts.sql"
  ),
  "utf8"
).toLowerCase();

describe("public bank account visibility", () => {
  it("lets the anonymous visitor read Rillcod's own receiving accounts", () => {
    expect(sql).toContain("create policy payment_accounts_public_read_rillcod");
    expect(sql).toMatch(/for select\s+to anon/);
    expect(sql).toContain("owner_type in ('rillcod', 'global')");
    expect(sql).toContain("is_active = true");
  });

  it("never exposes a partner school's own account through this door", () => {
    // Two independent guards: the owner_type filter above, and this one, so a
    // row mislabelled 'rillcod' still stays private while it carries a school.
    expect(sql).toContain("school_id is null");
  });

  it("grants read and nothing else", () => {
    expect(sql).toMatch(/revoke all on table public\.payment_accounts from anon/);
    expect(sql).toContain("grant select on table public.payment_accounts to anon");
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*payment_accounts[^;]*to anon/);
  });

  it("is re-runnable and atomic", () => {
    expect(sql).toContain(
      "drop policy if exists payment_accounts_public_read_rillcod on public.payment_accounts"
    );
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
  });
});
