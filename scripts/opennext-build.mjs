/**
 * Run OpenNext Cloudflare with OPENNEXT_CLOUDFLARE=1 so next.config
 * stubs firebase-admin / PDF engines (Worker size + jose resolve).
 * Temporarily hide bun.lock so OpenNext uses npm (bun is not installed here/CI).
 *
 * Usage:
 *   node scripts/opennext-build.mjs           → build
 *   node scripts/opennext-build.mjs deploy    → deploy (expects prior build or builds via opennext)
 *   node scripts/opennext-build.mjs preview
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

process.env.OPENNEXT_CLOUDFLARE = "1";

const root = process.cwd();
const bunLock = path.join(root, "bun.lock");
const bunLockHidden = path.join(root, "bun.lock.opennext-hidden");
let hidBun = false;
if (fs.existsSync(bunLock) && !fs.existsSync(bunLockHidden)) {
  fs.renameSync(bunLock, bunLockHidden);
  hidBun = true;
}

const args = process.argv.slice(2);
const mode = args[0] === "deploy" || args[0] === "preview" ? args[0] : "build";
const passthrough = mode === "build" ? args : args.slice(1);

try {
  const result = spawnSync(
    "npx",
    ["opennextjs-cloudflare", mode, ...passthrough],
    { stdio: "inherit", shell: true, env: process.env },
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (hidBun && fs.existsSync(bunLockHidden) && !fs.existsSync(bunLock)) {
    fs.renameSync(bunLockHidden, bunLock);
  }
}
