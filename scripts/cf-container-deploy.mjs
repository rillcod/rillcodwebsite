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
  const standaloneServer = path.join(nextDir, "standalone", "server.js");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.rillcod.com";
  const stampPath = path.join(nextDir, "cf-app-url.txt");
  const stampedUrl = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, "utf8").trim() : "";
  const needsBuild =
    !fs.existsSync(path.join(nextDir, "BUILD_ID")) ||
    !fs.existsSync(standaloneServer) ||
    stampedUrl !== appUrl;

  if (needsBuild) {
    console.log(`\nBuilding Next.js standalone (NEXT_PUBLIC_APP_URL=${appUrl})…\n`);
    const code = run("npm", ["run", "build"], { DOCKER_BUILD: "1", NEXT_PUBLIC_APP_URL: appUrl });
    if (code !== 0) process.exit(code);
    if (!fs.existsSync(standaloneServer)) {
      console.error("Expected .next/standalone/server.js — is output: standalone enabled?");
      process.exit(1);
    }
    fs.mkdirSync(nextDir, { recursive: true });
    fs.writeFileSync(stampPath, appUrl);
  } else {
    console.log(`Using existing .next/standalone build for ${appUrl}.`);
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
