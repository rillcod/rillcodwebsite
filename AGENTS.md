# Agent notes — Rillcod Academy

## Production hosting

**Cloudflare Containers** is production. See `docs/CLOUDFLARE_DEPLOY.md` and `.cursor/rules/cloudflare-deploy.mdc`.

- Deploy: push to `main` (GitHub Actions) or `npm run deploy` locally
- Cloudflare is the only deploy target. Vercel was fully removed on 2026-08-04 — do not
  reintroduce `vercel.json`, a `.vercel/` directory, or any `vercel env pull` step.

## Stack

Next.js App Router, Supabase, Paystack, LiveKit, R2. Worker gateway: `src/cloudflare/container-gateway.ts`.
