# Agent notes — Rillcod Academy

## Production hosting

**Cloudflare Containers** is production. See `docs/CLOUDFLARE_DEPLOY.md` and `.cursor/rules/cloudflare-deploy.mdc`.

- Deploy: push to `main` (GitHub Actions) or `npm run deploy` locally
- Do not use Vercel as primary publish path

## Stack

Next.js App Router, Supabase, Paystack, LiveKit, R2. Worker gateway: `src/cloudflare/container-gateway.ts`.
