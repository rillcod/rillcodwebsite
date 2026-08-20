# Agent notes — Rillcod Academy

## Production hosting

**Cloudflare Containers** is production. See `docs/CLOUDFLARE_DEPLOY.md` and `.cursor/rules/cloudflare-deploy.mdc`.

- Deploy: push to `main` → **CI** must pass → **Deploy Cloudflare** (or `npm run deploy` locally)
- Before pushing production fixes: `npm run typecheck` (same check CI and deploy both run)
- Cloudflare is the only deploy target. Vercel was fully removed on 2026-08-04 — do not
  reintroduce `vercel.json`, a `.vercel/` directory, or any `vercel env pull` step.

## Stack

Next.js App Router, Supabase, Paystack, LiveKit, R2. Worker gateway: `src/cloudflare/container-gateway.ts`.
