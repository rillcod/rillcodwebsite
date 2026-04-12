/**
 * Deploy `paystack-webhook` Edge Function and sync secrets from .env.local.
 * Requires SUPABASE_ACCESS_TOKEN in .env.local (Dashboard → Account → Access Tokens).
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
const PROJECT_REF = 'akaorqukdoawacvxsdij';

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n→ ${label}`);
  const isWin = process.platform === 'win32';
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    /** Windows: npx is a .cmd shim; argv spawn often fails with exit null */
    shell: isWin,
  });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status ?? r.signal})`);
    process.exit(r.status ?? 1);
  }
}

const local = parseEnvFile(envPath);
const token = local.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error(`
Missing SUPABASE_ACCESS_TOKEN.

1. Create a token: https://supabase.com/dashboard/account/tokens
2. Add to .env.local:
   SUPABASE_ACCESS_TOKEN=your_token_here
3. Run again:
   npm run supabase:deploy:paystack-webhook
`);
  process.exit(1);
}

const extra = { SUPABASE_ACCESS_TOKEN: token };

run('Deploy Edge Function paystack-webhook', 'npx', [
  'supabase',
  'functions',
  'deploy',
  'paystack-webhook',
  '--project-ref',
  PROJECT_REF,
], extra);

const pairs = [];
if (local.PAYSTACK_SECRET_KEY) {
  pairs.push(`PAYSTACK_SECRET_KEY=${local.PAYSTACK_SECRET_KEY}`);
}
if (local.NEXT_PUBLIC_APP_URL) {
  const base = local.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  pairs.push(`APP_URL=${base}`);
  pairs.push(`NEXT_PUBLIC_APP_URL=${base}`);
  pairs.push(`PAYSTACK_WEBHOOK_FORWARD_URL=${base}/api/payments/webhook`);
}
if (local.PAYMENT_WEBHOOK_INTERNAL_SECRET) {
  pairs.push(`PAYMENT_WEBHOOK_INTERNAL_SECRET=${local.PAYMENT_WEBHOOK_INTERNAL_SECRET}`);
}
/** Supabase API rejects secret names starting with SUPABASE_ */
if (local.SUPABASE_SERVICE_ROLE_KEY) {
  pairs.push(`EDGE_SERVICE_ROLE_KEY=${local.SUPABASE_SERVICE_ROLE_KEY}`);
}

if (pairs.length > 0) {
  run('Set Edge Function secrets (from .env.local)', 'npx', [
    'supabase',
    'secrets',
    'set',
    ...pairs,
    '--project-ref',
    PROJECT_REF,
  ], extra);
} else {
  console.log('\n→ No PAYSTACK_SECRET_KEY / NEXT_PUBLIC_APP_URL in .env.local — skipped secrets set.');
  console.log('  Add them to .env.local and run this script again to push secrets.');
}

console.log(`
✓ Done.

Paystack webhook URL:
  https://${PROJECT_REF}.supabase.co/functions/v1/paystack-webhook

In Paystack Dashboard → Settings → Webhooks, use that URL (same secret key as PAYSTACK_SECRET_KEY).

If you set PAYMENT_WEBHOOK_INTERNAL_SECRET above, add the same value to your Next host (.env / Vercel) for receipt callbacks from inline mode.
`);
