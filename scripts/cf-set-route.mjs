#!/usr/bin/env node
/**
 * Attach cf.rillcod.com (or CF_STAGING_HOST) custom domain route to Worker rillcodwebsite.
 * Requires rillcod.com zone on the same Cloudflare account as wrangler login.
 *
 * If DNS is still on Vercel (ns1.vercel-dns.com), add the zone in Cloudflare first:
 *   https://dash.cloudflare.com/?to=/:account/domains/add
 * Then import/copy DNS records and point cf → Worker (this script does the Worker side).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stagingHost = process.env.CF_STAGING_HOST || "cf.rillcod.com";
const openNextConfig = path.join(root, "open-next.config.ts");
const openNextHidden = path.join(root, "open-next.config.ts.container-hidden");

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: true,
    env: { ...process.env, ...extraEnv },
    stdio: ["inherit", "pipe", "pipe"],
  });
  return {
    code: result.status ?? 1,
    out: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

let hidOpenNext = false;
if (fs.existsSync(openNextConfig) && !fs.existsSync(openNextHidden)) {
  fs.renameSync(openNextConfig, openNextHidden);
  hidOpenNext = true;
}

let exitCode = 1;
try {
  console.log(`Setting Worker custom domain route for ${stagingHost}…\n`);
  const { code, out } = run("npx", ["wrangler", "deploy"], { OPENNEXT_CLOUDFLARE: "0" });
  process.stdout.write(out);

  if (code === 0) {
    console.log(`\nRoute live. Test: https://${stagingHost}`);
    console.log(`       (workers.dev fallback: https://rillcodwebsite.rillcod.workers.dev)`);
    exitCode = 0;
  } else if (/already has externally managed DNS records/i.test(out)) {
    console.error(`
Could not attach Worker custom domain — old DNS records still point to Vercel.

In Cloudflare Dashboard → rillcod.com → DNS → Records, DELETE:
  • www   (CNAME or A — usually cname.vercel-dns.com)
  • @     (A or CNAME for apex — if present)

Keep cf.rillcod.com as-is. Then re-run: npm run cf:set-route
`);
    exitCode = 1;
  } else if (/zone .* does not exist on your account/i.test(out)) {
    console.error(`
Could not set route — rillcod.com is not on this Cloudflare account yet.

Your domain DNS is currently on Vercel (ns1.vercel-dns.com). To use ${stagingHost}:

  1. Add rillcod.com to Cloudflare (same account as wrangler login):
     https://dash.cloudflare.com/?to=/:account/domains/add

  2. Import existing DNS records from Vercel, then change nameservers at your
     registrar to the two Cloudflare nameservers (or wait until cutover).

  3. Re-run: npm run cf:set-route

Until then, staging works at:
  https://rillcodwebsite.rillcod.workers.dev
`);
    exitCode = 1;
  } else {
    exitCode = code;
  }
} finally {
  if (hidOpenNext && fs.existsSync(openNextHidden) && !fs.existsSync(openNextConfig)) {
    fs.renameSync(openNextHidden, openNextConfig);
  }
}

process.exit(exitCode);
