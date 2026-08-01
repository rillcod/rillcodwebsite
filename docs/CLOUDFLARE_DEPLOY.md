# Cloudflare Containers — production deploy (source of truth)

**Primary host:** Cloudflare Containers (not Vercel, not Netlify, not OpenNext Workers).  
**Live URLs:** https://www.rillcod.com · https://rillcod.com · https://cf.rillcod.com  
**Worker name:** `rillcodwebsite`  
**Account ID:** `718b36de1443954931b052a9594d329d`

Vercel is paused / secondary. Do **not** treat `npm run deploy:vercel` or Netlify as production.

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
| `npm run cf:secrets` | Sync Worker secrets from `.env.vercel.local` |
| `npm run cf:container:cutover` | Print cutover checklist |

---

## Architecture notes (do not “simplify” away)

- **OpenNext Workers cannot fit this app** (~96 MiB vs 64 MiB limit). Production path is **Containers** + thin gateway `src/cloudflare/container-gateway.ts`.
- Deploy **hides** `open-next.config.ts` temporarily so Wrangler does not take the OpenNext path.
- Image is **standalone** (`DOCKER_BUILD=1` → `output: "standalone"` in `next.config.ts`) so the registry push stays small.
- **Crons** are enabled in `wrangler.toml` `[triggers].crons`. Disable matching **cron-job.org** jobs to avoid double emails.
- Staging subdomain **cf.rillcod.com** stays attached; production is **www** + apex.

---

## DNS / custom domains

- Zone **rillcod.com** must live on this Cloudflare account (nameservers: Cloudflare, not Vercel).
- Worker custom domains are declared in `wrangler.toml` `[[routes]]` with `custom_domain = true`.
- Do **not** keep Vercel A/CNAME records on `@` / `www` / `*` — they block Worker domain attach.
- Keep email DNS: `resend._domainkey`, `_dmarc`, MX if present.

---

## Files that must stay in the repo

| Path | Why |
|------|-----|
| `wrangler.toml` | Worker, containers, routes, crons, public vars |
| `Dockerfile.cf` | Production container image |
| `scripts/cf-container-deploy.mjs` | Host build + wrangler deploy |
| `scripts/cf-set-route.mjs` | Domain attach helper |
| `.github/workflows/deploy-cloudflare.yml` | Auto-deploy on push to `main` |
| `src/cloudflare/container-gateway.ts` | Worker → container gateway + cron fanout |
| `docs/CLOUDFLARE_DEPLOY.md` | This document |

Do not delete these to “clean up” OpenNext or Vercel leftovers without replacing the Containers path.

---

## After changing secrets / public env

1. Update `.env.local` / `.env.vercel.local` locally as needed.
2. `npm run cf:secrets` (Worker secrets).
3. Redeploy (`git push` or `npm run deploy`) so `NEXT_PUBLIC_*` baked into the image match production.
