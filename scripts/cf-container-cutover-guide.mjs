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
  2. Docker Desktop installed and running
  3. npm run cf:container:check   → must exit 0

Deploy staging
  1. Ensure wrangler.toml route is ${staging}/*
  2. In Cloudflare DNS for rillcod.com, add:
       Type: CNAME   Name: cf   Target: rillcodwebsite.<your-subdomain>.workers.dev
       (or use Workers custom domain UI: Workers → rillcodwebsite → Domains)
  3. npm run cf:secrets
  4. npm run cf:container:deploy
  5. CF_SMOKE_BASE=https://${staging} npm run cf:container:smoke
  6. Manually verify: login, dashboard, one API, one PDF, one upload

Production cutover (only after staging is green)
  1. Set NEXT_PUBLIC_APP_URL to https://${production} in wrangler.toml [vars]
  2. Attach custom domain ${production} (+ www) to Worker rillcodwebsite
  3. npm run cf:secrets && npm run cf:container:deploy
  4. Smoke-test https://${production}
  5. Keep Vercel as fallback until confident, then disable Vercel domain

Cron
  Worker [triggers].crons already proxies to /api/cron/* on the container.
  Ensure CRON_SECRET is uploaded via npm run cf:secrets.
`);
