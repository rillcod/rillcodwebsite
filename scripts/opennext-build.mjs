/**
 * Run OpenNext Cloudflare build with OPENNEXT_CLOUDFLARE=1 so next.config
 * stubs firebase-admin (avoids jwks-rsa → jose workerd resolve failure).
 */
import { spawnSync } from "node:child_process";

process.env.OPENNEXT_CLOUDFLARE = "1";

const result = spawnSync(
  "npx",
  ["opennextjs-cloudflare", "build", ...process.argv.slice(2)],
  { stdio: "inherit", shell: true, env: process.env },
);

process.exit(result.status ?? 1);
