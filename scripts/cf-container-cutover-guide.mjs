#!/usr/bin/env node
/**
 * Print the staging → production cutover checklist for Cloudflare Containers.
 * Does not change DNS; safe to run anytime.
 */
const staging = process.env.CF_STAGING_HOST || "cf.rillcod.com";
const production = process.env.CF_PROD_HOST || "rillcod.com";

console.log(`
Cloudflare Containers cutover guide
===================================

Prerequisites
  1. Workers Paid plan: https://dash.cloudflare.com/?to=/:account/workers/plans
  2. Docker Desktop installed and running (local deploys)
  3. npm run cf:container:check   → must exit 0
  4. GitHub Actions auto-deploy (push to main):
       Repo secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
       Workflow: .github/workflows/deploy-cloudflare.yml
       Account ID: 718b36de1443954931b052a9594d329d
       Token: Edit Cloudflare Workers + Containers + Account DNS (zone)

Deploy staging
  1. rillcod.com must be on this Cloudflare account (done — nameservers point at Cloudflare):
       https://dash.cloudflare.com/?to=/:account/domains/add
  2. npm run cf:set-route          → attaches ${staging} custom domain to Worker
     (or full deploy: npm run cf:container:deploy)
  3. npm run cf:secrets
  4. CF_SMOKE_BASE=https://${staging} npm run cf:container:smoke
  5. Fallback URL until DNS cutover: https://rillcodwebsite.rillcod.workers.dev
  6. Manually verify: login, dashboard, one API, one PDF, one upload

Production cutover (only after staging is green)
  1. Set NEXT_PUBLIC_APP_URL to https://${production} in wrangler.toml [vars]
  2. Attach custom domain ${production} (+ www) to Worker rillcodwebsite
  3. npm run cf:secrets && npm run cf:container:deploy
  4. Smoke-test https://${production}
     (Cutover is DONE — Cloudflare is the only host; Vercel was removed 2026-08-04.)

Cron
  wrangler.toml has NO [triggers] block, deliberately. cron-job.org owns every schedule.
  A block here does not replace that — the gateway's scheduled() handler calls the same
  routes, so parents get a second copy of every billing, invoice and payment reminder.
  (That is exactly what happened: a [triggers] block sat live from 2026-07-31 to 2026-08-04.)

  Cloudflare CAN own scheduling if you want it to — Workers Paid allows 250 cron triggers at
  1-minute granularity, far past the old serverless limits that pushed these jobs to
  cron-job.org in the first place. To move them, in this order:
    a. Ensure CRON_SECRET is uploaded via npm run cf:env.
    b. DISABLE the matching cron-job.org entries first, and confirm they stopped.
    c. Only then add [triggers].crons to wrangler.toml and deploy.
  src/lib/operations/cron-registry.ts lists every job and how it is triggered.
`);
