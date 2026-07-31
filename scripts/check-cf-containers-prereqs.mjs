#!/usr/bin/env node
/**
 * Verify Cloudflare Containers prerequisites:
 * - Wrangler auth
 * - Workers Paid (Containers API access)
 * - Docker daemon available
 *
 * Exit 0 when ready; exit 1 with instructions otherwise.
 */
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
}

let ok = true;

console.log("Checking Wrangler auth…");
const whoami = run("npx", ["wrangler", "whoami"]);
if ((whoami.status ?? 1) !== 0) {
  console.error("Not logged in. Run: npx wrangler login");
  ok = false;
} else {
  console.log(whoami.stdout?.split("\n").slice(0, 8).join("\n") || "ok");
}

console.log("\nChecking Containers API (Workers Paid)…");
const containers = run("npx", ["wrangler", "containers", "list"]);
const combined = `${containers.stdout || ""}\n${containers.stderr || ""}`;
if ((containers.status ?? 1) !== 0 || /Unauthorized|Workers Paid/i.test(combined)) {
  console.error(
    "Containers unavailable. Upgrade Workers Paid:\n  https://dash.cloudflare.com/?to=/:account/workers/plans",
  );
  ok = false;
} else {
  console.log("Containers API reachable.");
}

console.log("\nChecking Docker…");
const docker = run("docker", ["info"]);
if ((docker.status ?? 1) !== 0) {
  console.error(
    "Docker not available. Install and start Docker Desktop:\n  https://docs.docker.com/desktop/",
  );
  ok = false;
} else {
  console.log("Docker is running.");
}

if (!ok) {
  console.error("\nPrerequisites not met — fix the items above, then re-run:");
  console.error("  npm run cf:container:check");
  process.exit(1);
}

console.log("\nAll prerequisites OK. Deploy with: npm run cf:container:deploy");
process.exit(0);
