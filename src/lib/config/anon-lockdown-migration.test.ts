import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260929000115_lock_anon_out_of_money_and_people.sql"),
  "utf8"
).toLowerCase();

describe("anon lockdown on money and people", () => {
  it("revokes the visitor role from every money and people table", () => {
    expect(sql).toMatch(/revoke all on table public\.portal_users\s+from anon/);
    expect(sql).toMatch(/revoke all on table public\.invoices\s+from anon/);
    expect(sql).toMatch(/revoke all on table public\.payments\s+from anon/);
    expect(sql).toMatch(/revoke all on table public\.billing_cycles\s+from anon/);
    expect(sql).toMatch(/revoke all on table public\.prospective_students\s+from anon/);
  });

  it("drops the two using(true) policies on the enquiry list", () => {
    expect(sql).toMatch(/drop policy if exists "allow authenticated read"\s+on public\.prospective_students/);
    expect(sql).toMatch(/drop policy if exists "allow authenticated update"\s+on public\.prospective_students/);
  });

  it("removes the public insert paths into the enquiry list", () => {
    expect(sql).toMatch(/drop policy if exists "allow public insert"\s+on public\.prospective_students/);
    expect(sql).toMatch(/drop policy if exists "public can insert prospective students"\s+on public\.prospective_students/);
  });

  it("removes anonymous school creation", () => {
    expect(sql).toMatch(/drop policy if exists "public can insert schools"\s+on public\.schools/);
  });

  it("keeps the registration dropdown working, narrowed to approved schools", () => {
    expect(sql).toContain("create policy schools_public_read_approved");
    expect(sql).toContain("using (status = 'approved')");
    expect(sql).toContain("grant select on table public.schools to anon");
  });

  it("replaces the blanket school read policies rather than leaving them behind", () => {
    expect(sql).toMatch(/drop policy if exists "public can view schools"\s+on public\.schools/);
    expect(sql).toMatch(/drop policy if exists "schools_select_all"\s+on public\.schools/);
  });

  it("runs as one transaction", () => {
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
  });
});
