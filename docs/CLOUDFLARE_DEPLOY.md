# Cloudflare Containers — production deploy (source of truth)

**Only host:** Cloudflare Containers.  
**Live URLs:** https://www.rillcod.com · https://rillcod.com · https://cf.rillcod.com  
**Worker name:** `rillcodwebsite`  
**Account ID:** `718b36de1443954931b052a9594d329d`

Vercel was **fully removed on 2026-08-04** — `vercel.json`, `.vercel/`, `.env.vercel.local`,
the `deploy:vercel` script and the Vercel-sourced env sync are all gone. Do not reintroduce them.

---

## How updates go live (like “push to Git”)

### Automatic (preferred)

1. Push (or merge) to **`main`**.
2. GitHub Action **CI** runs first (lint, typecheck, tests, production build):
   - `.github/workflows/ci.yml`
3. Only when that CI push run succeeds, **Deploy Cloudflare** starts for the
   same commit:
   - `.github/workflows/deploy-cloudflare.yml`
4. Site updates after the deploy job succeeds (~10–20 minutes after CI).

Deploy no longer races CI on the same push. A type error fails CI and never
starts the container build. Manual re-run still works via **workflow_dispatch**.

**Required GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers + Containers edit (create at https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | `718b36de1443954931b052a9594d329d` |

Manual re-run: https://github.com/rillcod/rillcodwebsite/actions

### Local (same result)

```powershell
# Docker Desktop must be running
npm run deploy
```

Uses `scripts/cf-container-deploy.mjs` → host Next.js **standalone** build → `Dockerfile.cf` → `wrangler deploy`.

---

## Key commands

The post-deploy smoke check defaults to `https://www.rillcod.com`. Each route has a
30-second request deadline and up to three attempts for HTTP 502/503/504 or transport
failures, with two/four-second backoff. Other unexpected statuses fail immediately;
persistent failures still fail deployment. Logs include `cf-ray` when returned so an
operator can correlate an outage with Cloudflare logs. A passing later check does not
establish the cause of an earlier failure. This check does not change container sizing,
idle shutdown, scheduling, or enforce a hosting spending cap.

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | `tsc --noEmit` — run before pushing to `main` |
| `npm run deploy` | Full local Cloudflare Containers deploy |
| `npm run cf:container:deploy:ci` | Deploy without local prereq checks (CI) |
| `npm run cf:set-route` | Attach custom domains in `wrangler.toml` |
| `npm run cf:container:smoke` | Smoke-test https://www.rillcod.com |
| `npm run cf:env` | Sync `wrangler.toml [vars]` **and** Worker secrets from `.env` / `.env.local` |
| `npm run cf:env:check` | Dry run of the above — prints what would change, uploads nothing |
| `npm run cf:secrets` | Secrets only |
| `npm run cf:container:cutover` | Print cutover checklist |

---

## Architecture notes (do not “simplify” away)

### Cost target and background automation (2026-09-07)

Deployment regression guard: `node scripts/check-container-cost-policy.mjs` parses the actual
Wrangler configuration and rejects anything except one basic instance, maximum one instance,
cron-job.org ownership and the reviewed short idle default. CI, the deployment workflow and
the local deployment script all execute it before deployment. The deployment workflow also runs
`node scripts/check-container-cost-policy.mjs --live` after smoke checks and fails if Cloudflare
still reports a larger memory/CPU/disk allocation or instance limit. This reports deployment drift;
it does not automatically terminate running customer work or roll back to an expensive image.

Browser OAuth access was restored on 2026-09-07. Live inspection confirmed one running instance,
6144 MiB memory, 1 vCPU, 12 GB disk and max_instances=5. The inventory's `instances=5` field did
not mean five running processes: the separate instance listing returned one. Use that distinction
when reporting costs. Local `.env` API tokens may override OAuth; the saved project token was rejected.

The owner's total hosting budget is $5/month. Smaller containers and shorter idle time reduce
consumption; they do **not** enforce that budget. At current published pricing, basic's 1 GiB
uses the memory allowance in 25 running hours/month. CPU, disk, egress, Workers and Durable
Objects have separate included allowances. See https://developers.cloudflare.com/containers/platform/pricing/.

- Every application `after()` callback must import `@/lib/server/after`, which registers work
  before the response completes and releases it on completion/failure. All four current callers
  have been migrated. Nested cron fan-out remains protected by its parent callback.
- Before idle shutdown, the gateway queries the running Node process through authenticated
  `/api/system/container-work`. This is a local, database-free check and never starts a sleeping
  container. Failed checks retain the instance and log an error to protect ongoing work;
  repeated probe failures can therefore incur costs and must be fixed before declaring success.
- Immutable public `/_next/static/` assets use the Worker cache before container dispatch.
  Cache hits do not wake the container. Customer pages, API results, uploads, cookies, errors
  and partial responses are excluded. Cache misses still reach the container.
- No new cron schedule or paid service has been added. Cron-job.org remains the scheduler.

Required production verification: authenticate Wrangler, inspect deployed instance type/count,
deploy only after CI passes, confirm queued/background callbacks keep the instance alive and it
sleeps after completion, check probe errors, then measure actual runtime and billing usage over
the billing period. Test PDF and generation memory under the basic instance's 1 GiB limit.
CLI inspection on 2026-09-07 failed with an authentication error; production savings remain unverified.

If measured essential work exceeds the allowance, the strict $5 requirement needs migration of
more frontend/API/job execution to Workers-compatible execution while retaining required Node
functions as an explicitly budgeted component, or an owner-approved pause when allowances are
exhausted. Neither has been implemented. Do not silently pause customer access, payment handling
or automation, and do not promise that these optimizations eliminate all overages.

- The full application runs in **Containers** behind the thin gateway `src/cloudflare/container-gateway.ts`; there is no second Workers/OpenNext deployment path.
- Image is **standalone** (`DOCKER_BUILD=1` → `output: "standalone"` in `next.config.ts`) so the registry push stays small.
- **Cost envelope:** production is capped at one `basic` (1 GiB) instance and the gateway
  scales it to zero after a five-second idle burst. Invalid cron requests are rejected before
  Next.js starts. Valid external cron pings are admitted no more often than the cadence in
  `cron-registry.ts`; extra pings receive `202 scheduler_call_coalesced` without waking the
  container. An authenticated operator may use `x-rillcod-cron-force: true` for a deliberate
  recovery retry; cron-job.org must not set that header. This is essential because a 3-minute idle window plus a 2–5 minute scheduler kept
  the former 6 GiB `standard-2` instance alive for an entire month.
- The Workers Paid plan includes 25 GiB-hours of container memory. The settings above are designed
  to keep a low-traffic installation inside that allowance, but traffic is usage-based: review
  Cloudflare usage alerts and do not raise the instance size, idle window, scheduler frequency or
  instance count without estimating the new monthly GiB-hours first.
- **Crons are NOT scheduled here.** `wrangler.toml` has no `[triggers]` block, deliberately.
  Every job is registered on **cron-job.org**; `src/lib/operations/cron-registry.ts` is the source
  of truth for what runs and how often. A `[triggers]` block did sit here until 2026-08-04 and was
  double-firing the invoice/billing/payment reminders that email parents, because the gateway's
  `scheduled()` handler calls the same routes cron-job.org already calls. If you ever want
  Cloudflare to own scheduling (it can — Workers Paid allows 250 triggers at 1-minute
  granularity), **disable the cron-job.org entries first**, then add the block back and set
  `CLOUDFLARE_OWNS_CRON = "true"` (today production keeps `CLOUDFLARE_OWNS_CRON = "false"`).

### Prove cron-job.org still matches the registry

1. `npm run cron:table` — pasteable schedule from the registry (docs / cron-job.org checklist).
2. `GET /api/system/cron-health` with header `x-cron-secret: $CRON_SECRET` — **200** when every
   monitored job's `last_success_at` is within `max(15m, 2× registry interval)`; **503** when any
   job is overdue or has never succeeded. Optional `?scope=external` limits the check to
   cron-job.org-owned jobs (excludes fan-out children). This route is a probe, not a scheduled
   job — it sits under `/api/system` so the cron registry stays schedule-only.
3. Wire that URL into an uptime monitor. Operations Health in the admin UI still uses the
   softer late/grace view; `/api/system/cron-health` is the hard liveness signal.
- Staging subdomain **cf.rillcod.com** stays attached; production is **www** + apex.

---

## DNS / custom domains

- Zone **rillcod.com** must live on this Cloudflare account (nameservers pointed at Cloudflare).
- Worker custom domains are declared in `wrangler.toml` `[[routes]]` with `custom_domain = true`.
- Do **not** keep third-party A/CNAME records on `@` / `www` / `*` — they block Worker domain attach.
- Keep email DNS: `resend._domainkey`, `_dmarc`, MX if present.

---

## Files that must stay in the repo

| Path | Why |
|------|-----|
| `wrangler.toml` | Worker, containers, routes, public vars (no crons — see above) |
| `Dockerfile.cf` | Production container image |
| `scripts/cf-container-deploy.mjs` | Host build + wrangler deploy |
| `scripts/cf-set-route.mjs` | Domain attach helper |
| `.github/workflows/deploy-cloudflare.yml` | Auto-deploy on push to `main` |
| `src/cloudflare/container-gateway.ts` | Worker → container gateway + cron fanout |
| `docs/CLOUDFLARE_DEPLOY.md` | This document |

These files are the complete production path. Do not add a parallel hosting configuration.

---

## After changing secrets / public env

1. Update **both** `.env` and `.env.local` — they are kept identical on purpose, so a value can
   never differ depending on which file a tool loads. Add new keys to `.env.example` too.
2. `npm run cf:env:check` — dry run. Confirm the key list is what you expect.
3. `npm run cf:env` — writes `wrangler.toml [vars]` and uploads Worker secrets.
4. Redeploy (`git push` or `npm run deploy`) so `NEXT_PUBLIC_*` baked into the image match production.

### Never paste a placeholder value

The sync script refuses any value that looks like `[SENSITIVE]`, `changeme`, or a `_URL` key
without a scheme, and exits non-zero.

This guard exists because of a real outage. The old script read `.env.vercel.local` **last**, and
`vercel env pull` writes the literal string `[SENSITIVE]` for every var marked sensitive. That
silently overwrote ten real credentials — Upstash, LiveKit, Resend, Firebase — and uploaded the
placeholder to Cloudflare. Public receipt upload returned 500 with the raw Upstash error printed
on the registration page. Uploading a placeholder is worse than uploading nothing: the app's
“is it configured?” checks pass, and the failure only surfaces later, in production.
