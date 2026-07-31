#!/usr/bin/env node
/**
 * Upload FIREBASE_SERVICE_ACCOUNT_JSON to Cloudflare Workers secrets.
 * Requires: wrangler login (or CLOUDFLARE_API_TOKEN) + .env.local with the JSON.
 *
 * Usage: node scripts/set-cloudflare-fcm-secret.mjs
 */
const { spawnSync } = require('child_process');
const fs = require('fs');

const PROJECT = process.env.CF_PAGES_PROJECT || process.env.CF_WORKER_NAME || 'rillcodwebsite';
const envPath = '.env.local';
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local');
  process.exit(1);
}
const env = fs.readFileSync(envPath, 'utf8');
const m = env.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(.*)$/m);
if (!m || !m[1].trim()) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON missing in .env.local');
  process.exit(1);
}
const value = m[1].trim();
JSON.parse(value); // validate

console.log(`Uploading FIREBASE_SERVICE_ACCOUNT_JSON to Worker: ${PROJECT}`);
const r = spawnSync(
  'npx',
  ['wrangler', 'secret', 'put', 'FIREBASE_SERVICE_ACCOUNT_JSON', '--name', PROJECT],
  { input: value, encoding: 'utf8', shell: true, stdio: ['pipe', 'inherit', 'inherit'] },
);
process.exit(r.status ?? 1);
