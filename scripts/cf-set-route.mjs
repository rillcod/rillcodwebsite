#!/usr/bin/env node
/**
 * Attach cf.rillcod.com (or CF_STAGING_HOST) custom domain route to Worker rillcodwebsite.
 * Requires rillcod.com zone on the same Cloudflare account as wrangler login.
 *
 * If the zone is not on Cloudflare yet, add it first:
 *   https://dash.cloudflare.com/?to=/:account/domains/add
 * Then import/copy DNS records and point cf → Worker (this script does the Worker side).
 */
import { spawnSync } from "node:child_process";

const stagingHost = process.env.CF_STAGING_HOST || "cf.rillcod.com";

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

let exitCode = 1;
{
  console.log(`Setting Worker custom domain route for ${stagingHost}…\n`);
  const { code, out } = run("npx", ["wrangler", "deploy"]);
  process.stdout.write(out);

  if (code === 0) {
    console.log(`\nRoute live. Test: https://${stagingHost}`);
    console.log(`       (workers.dev fallback: https://rillcodwebsite.rillcod.workers.dev)`);
    exitCode = 0;
  } else if (/already has externally managed DNS records/i.test(out)) {
    console.error(`
Could not attach Worker custom domain — stale DNS records are still in the way.

In Cloudflare Dashboard → rillcod.com → DNS → Records, DELETE:
  • www   (CNAME or A pointing anywhere other than this Worker)
  • @     (A or CNAME for apex — if present)

Keep cf.rillcod.com as-is. Then re-run: npm run cf:set-route
`);
    exitCode = 1;
  } else if (/zone .* does not exist on your account/i.test(out)) {
    console.error(`
Could not set route — rillcod.com is not on this Cloudflare account yet.

The zone is not on this Cloudflare account. To use ${stagingHost}:

  1. Add rillcod.com to Cloudflare (same account as wrangler login):
     https://dash.cloudflare.com/?to=/:account/domains/add

  2. Import the existing DNS records, then change nameservers at your
     registrar to the two Cloudflare nameservers.

  3. Re-run: npm run cf:set-route

Until then, staging works at:
  https://rillcodwebsite.rillcod.workers.dev
`);
    exitCode = 1;
  } else {
    exitCode = code;
  }
}

process.exit(exitCode);
