#!/usr/bin/env node
/**
 * Cloudflare Containers deploy (primary host).
 * 1. Build Next.js on the host (reliable on Windows).
 * 2. Package .next into a slim Docker image (Dockerfile.cf).
 * 3. wrangler deploy — hides open-next.config.ts so Wrangler skips OpenNext Workers path.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const openNextConfig = path.join(root, "open-next.config.ts");
const openNextHidden = path.join(root, "open-next.config.ts.container-hidden");

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

function ensureNextBuild() {
  const nextDir = path.join(root, ".next");
  if (!fs.existsSync(path.join(nextDir, "BUILD_ID"))) {
    console.log("\nBuilding Next.js on host (npm run build)…\n");
    const code = run("npm", ["run", "build"], { DOCKER_BUILD: "1" });
    if (code !== 0) process.exit(code);
  } else {
    console.log("Using existing .next build (delete .next to force rebuild).");
  }
}

let hidOpenNext = false;
if (fs.existsSync(openNextConfig) && !fs.existsSync(openNextHidden)) {
  fs.renameSync(openNextConfig, openNextHidden);
  hidOpenNext = true;
}

let exitCode = 1;
try {
  ensureNextBuild();
  exitCode = run("npx", ["wrangler", "deploy"], { OPENNEXT_CLOUDFLARE: "0" });
} finally {
  if (hidOpenNext && fs.existsSync(openNextHidden) && !fs.existsSync(openNextConfig)) {
    fs.renameSync(openNextHidden, openNextConfig);
  }
}

process.exit(exitCode);
