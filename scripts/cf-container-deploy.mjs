#!/usr/bin/env node
/**
 * Cloudflare Containers deploy (primary host).
 * 1. Build Next.js on the host (reliable on Windows).
 * 2. Package .next into a slim Docker image (Dockerfile.cf).
 * 3. Deploy the thin Worker gateway and its Container image with Wrangler.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

/**
 * Dockerfile.cf copies `.next/static` as its own layer, because a standalone build
 * has never included the static assets — the Next docs tell you to copy them
 * yourself. After the Next 16 upgrade a CI build succeeded, wrote
 * `.next/standalone/server.js`, and the image build then died on
 *
 *   failed to compute cache key: "/.next/static": not found
 *
 * The old check here only looked for `standalone/server.js`, so a tree Docker was
 * going to reject passed as good and the failure surfaced several minutes later as
 * a checksum error naming no cause.
 *
 * This verifies what Docker will actually copy. If the assets have moved inside the
 * standalone output — which is where a version that starts bundling them would put
 * them — they are lifted back to the path the Dockerfile expects rather than the
 * deploy failing over a directory layout. If they are nowhere, it says so here,
 * with the tree, instead of leaving you reading Docker output.
 */
function ensureStaticForDocker(nextDir) {
  const expected = path.join(nextDir, "static");
  if (fs.existsSync(expected)) return;

  const insideStandalone = path.join(nextDir, "standalone", ".next", "static");
  if (fs.existsSync(insideStandalone)) {
    console.log("Lifting .next/standalone/.next/static -> .next/static for the image build.");
    fs.cpSync(insideStandalone, expected, { recursive: true });
    return;
  }

  const list = (dir) =>
    (fs.existsSync(dir) ? fs.readdirSync(dir) : ["(missing)"]).join(", ");
  console.error(
    "\nThe build produced no static assets for Dockerfile.cf to copy.\n" +
      `  looked for: ${expected}\n` +
      `  and:        ${insideStandalone}\n\n` +
      `  .next contains:            ${list(nextDir)}\n` +
      `  .next/standalone contains: ${list(path.join(nextDir, "standalone"))}\n` +
      `  .next/standalone/.next:    ${list(path.join(nextDir, "standalone", ".next"))}\n\n` +
      "Docker would fail on COPY .next/static with an opaque cache-key error.\n",
  );
  process.exit(1);
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

  // Both paths, not just a fresh build: a reused tree can be missing the assets
  // just as easily, and the image build is what has to succeed either way.
  ensureStaticForDocker(nextDir);
}

ensureNextBuild();
const exitCode = run("npx", ["wrangler", "deploy"]);

process.exit(exitCode);
