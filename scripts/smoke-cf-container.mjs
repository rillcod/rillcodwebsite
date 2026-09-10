#!/usr/bin/env node
/**
 * Smoke-test Cloudflare Containers after deploy, allowing bounded startup recovery.
 *
 * Usage:
 *   node scripts/smoke-cf-container.mjs
 *   CF_SMOKE_BASE=https://cf.rillcod.com node scripts/smoke-cf-container.mjs
 */
import { checkSmokePath } from './lib/container-smoke.mjs';

const base = (process.env.CF_SMOKE_BASE || "https://www.rillcod.com").replace(/\/$/, "");

const paths = [
  { path: "/", expect: [200, 301, 302, 307, 308] },
  { path: "/login", expect: [200] },
  { path: "/api/auth/me", expect: [200, 401, 403] },
];

let failed = 0;
for (const { path, expect } of paths) {
  const url = `${base}${path}`;
  if (!(await checkSmokePath(url, expect))) failed += 1;
}

if (failed) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nSmoke checks passed.");
