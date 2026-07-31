#!/usr/bin/env node
/**
 * Smoke-test the Cloudflare Containers staging host after deploy.
 *
 * Usage:
 *   node scripts/smoke-cf-container.mjs
 *   CF_SMOKE_BASE=https://cf.rillcod.com node scripts/smoke-cf-container.mjs
 */
const base = (process.env.CF_SMOKE_BASE || "https://cf.rillcod.com").replace(/\/$/, "");

const paths = [
  { path: "/", expect: [200, 301, 302, 307, 308] },
  { path: "/login", expect: [200] },
  { path: "/api/auth/me", expect: [200, 401, 403] },
];

let failed = 0;
for (const { path, expect } of paths) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "rillcod-cf-smoke/1.0" },
    });
    const ok = expect.includes(res.status);
    console.log(`${ok ? "OK" : "FAIL"} ${res.status} ${url}`);
    if (!ok) failed += 1;
  } catch (err) {
    console.error(`FAIL ${url}:`, err?.message || err);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nSmoke checks passed.");
