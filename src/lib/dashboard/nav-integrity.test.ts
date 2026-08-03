import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDashboardPathBlockedForRole } from "./route-access";

/**
 * The sidebar is the only map most users have of this app, so every row in it
 * has to be a real, openable place for the role being shown it.
 *
 * Two failures are invisible in review and obvious in use: a row pointing at a
 * route with no page (a 404 from your own navigation), and a row pointing at a
 * route the access rules block for that very role (a click that bounces you
 * straight back out). Both are checked here against the real rules, not a copy.
 */
const ROOT = process.cwd();
const NAV_PATH = "src/components/layout/DashboardNavigation.tsx";
const NAV = readFileSync(join(ROOT, NAV_PATH), "utf8");

const ROLES = ["admin", "teacher", "student", "school", "parent"] as const;

type NavRow = { name: string; href: string };

/** Nav rows live inside a `case "<role>":` arm, so slice the arm and read them. */
function navRowsForRole(role: string): NavRow[] {
  const start = NAV.indexOf(`case "${role}":`);
  expect(start, `no nav case block for role "${role}"`).toBeGreaterThan(-1);

  let end = NAV.length;
  for (const other of [...ROLES, "default"]) {
    const marker = other === "default" ? "\n      default:" : `case "${other}":`;
    const at = NAV.indexOf(marker, start + 1);
    if (at > start && at < end) end = at;
  }

  const block = NAV.slice(start, end);
  const rows: NavRow[] = [];
  const pattern = /name:\s*"([^"]+)"[\s\S]{0,120}?href:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block))) {
    rows.push({ name: match[1], href: match[2] });
  }
  expect(rows.length, `no nav rows parsed for role "${role}"`).toBeGreaterThan(0);
  return rows;
}

/** App-router resolution: /dashboard/x -> src/app/dashboard/x/page.tsx */
function hasPage(href: string): boolean {
  const path = href.split("?")[0].split("#")[0].replace(/\/$/, "");
  const rel = path.replace(/^\//, "");
  return ["page.tsx", "page.ts", "route.ts"].some((leaf) =>
    existsSync(join(ROOT, "src/app", rel, leaf))
  );
}

describe("dashboard navigation integrity", () => {
  for (const role of ROLES) {
    it(`gives ${role} only rows that resolve to a real page`, () => {
      const broken = navRowsForRole(role)
        .filter((row) => !hasPage(row.href))
        .map((row) => `${row.name} -> ${row.href}`);
      expect(broken).toEqual([]);
    });

    it(`gives ${role} only rows that ${role} is allowed to open`, () => {
      const bounced = navRowsForRole(role)
        .filter((row) => isDashboardPathBlockedForRole(row.href, role))
        .map((row) => `${row.name} -> ${row.href}`);
      expect(bounced).toEqual([]);
    });

    it(`does not show ${role} the same destination twice`, () => {
      const seen = new Map<string, string[]>();
      for (const row of navRowsForRole(role)) {
        // Anchors are distinct sections of one page, so they are not duplicates.
        const key = row.href.split("#")[0];
        seen.set(key, [...(seen.get(key) ?? []), row.name]);
      }
      const repeated = [...seen.entries()]
        .filter(([, names]) => names.length > 1)
        .map(([href, names]) => `${href} <- ${names.join(" | ")}`);
      expect(repeated).toEqual([]);
    });

    it(`fills all four mobile tabs for ${role}`, () => {
      // bottomNavByRole matches sidebar rows by name, so renaming a row drops
      // its tab with no error anywhere — the bar just comes back short.
      const block = NAV.slice(
        NAV.indexOf("const bottomNavByRole"),
        NAV.indexOf("const bottomNavNames")
      );
      const line = new RegExp(`${role}:\\s*\\[([^\\]]*)\\]`).exec(block);
      expect(line, `no bottom nav list for "${role}"`).not.toBeNull();

      const wanted = [...line![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const available = new Set(navRowsForRole(role).map((row) => row.name));
      expect(wanted.filter((name) => !available.has(name))).toEqual([]);
    });
  }
});
