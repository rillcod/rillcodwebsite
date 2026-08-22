# Agent notes — Rillcod Academy

## Production hosting

**Cloudflare Containers** is production. See `docs/CLOUDFLARE_DEPLOY.md` and `.cursor/rules/cloudflare-deploy.mdc`.

- Deploy: push to `main` → **CI** must pass → **Deploy Cloudflare** (or `npm run deploy` locally)
- Before pushing production fixes: `npm run typecheck` (same check CI and deploy both run)
- Cloudflare is the only deploy target. Vercel was fully removed on 2026-08-04 — do not
  reintroduce `vercel.json`, a `.vercel/` directory, or any `vercel env pull` step.

## Stack

Next.js App Router, Supabase, Paystack, LiveKit, R2. Worker gateway: `src/cloudflare/container-gateway.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
