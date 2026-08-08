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
2. GitHub Action **Deploy Cloudflare** runs:
   - `.github/workflows/deploy-cloudflare.yml`
3. Site updates after the job succeeds (~10–20 minutes).

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

| Command | Purpose |
|---------|---------|
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

- The full application runs in **Containers** behind the thin gateway `src/cloudflare/container-gateway.ts`; there is no second Workers/OpenNext deployment path.
- Image is **standalone** (`DOCKER_BUILD=1` → `output: "standalone"` in `next.config.ts`) so the registry push stays small.
- **Crons are NOT scheduled here.** `wrangler.toml` has no `[triggers]` block, deliberately.
  Every job is registered on **cron-job.org**; `src/lib/operations/cron-registry.ts` is the source
  of truth for what runs and how often. A `[triggers]` block did sit here until 2026-08-04 and was
  double-firing the invoice/billing/payment reminders that email parents, because the gateway's
  `scheduled()` handler calls the same routes cron-job.org already calls. If you ever want
  Cloudflare to own scheduling (it can — Workers Paid allows 250 triggers at 1-minute
  granularity), **disable the cron-job.org entries first**, then add the block back.
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
