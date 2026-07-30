#!/usr/bin/env node
/**
 * Sync .env.vercel.local → Cloudflare Pages:
 * - Public / build-time vars → wrangler.toml [vars]
 * - Secrets → wrangler pages secret put
 *
 * Usage: node scripts/sync-cloudflare-env-from-vercel.mjs
 * Optional: --vars-only | --secrets-only | --dry-run
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = process.env.CF_PAGES_PROJECT || "rillcodwebsite";
const ENV_FILE = path.resolve(ROOT, process.env.CF_ENV_FILE || ".env.vercel.local");
const WRANGLER = path.join(ROOT, "wrangler.toml");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const varsOnly = args.has("--vars-only");
const secretsOnly = args.has("--secrets-only");

const PUBLIC_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP",
  "ENABLE_PAYMENTS",
  "LIVEKIT_URL",
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "RESEND_FROM_EMAIL",
  "WHATSAPP_API_URL",
  "ADMIN_OPS_EMAIL",
];

const SECRET_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "SENDPULSE_API_ID",
  "SENDPULSE_API_SECRET",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "HUGGINGFACE_API_KEY",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "R2_SECRET_ACCESS_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "VAPID_PRIVATE_KEY",
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "CRON_SECRET",
  "BILLING_CRON_SECRET",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
];

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Vercel env pull may escape newlines as \n in JSON secrets
    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    env[key] = value;
  }
  return env;
}

function tomlEscape(value) {
  return JSON.stringify(String(value));
}

function writeWranglerVars(env) {
  let base = fs.readFileSync(WRANGLER, "utf8");
  // Drop any existing [vars] section (and following blank lines until next section)
  base = base.replace(/\r\n/g, "\n");
  base = base.replace(/\n\[vars\][\s\S]*?(?=\n\[|$)/, "\n").trimEnd() + "\n";

  const lines = ["", "[vars]"];
  const written = [];
  for (const key of PUBLIC_KEYS) {
    const value = env[key];
    if (!value) continue;
    lines.push(`${key} = ${tomlEscape(value)}`);
    written.push(key);
  }
  lines.push("");

  if (dryRun) {
    console.log(`[dry-run] would write ${written.length} vars to wrangler.toml:`);
    console.log(written.join(", "));
    return written;
  }

  fs.writeFileSync(WRANGLER, base + lines.join("\n"), "utf8");
  console.log(`Updated wrangler.toml [vars] with ${written.length} keys:`);
  console.log(written.join(", "));
  return written;
}

function putSecret(name, value) {
  if (dryRun) {
    console.log(`[dry-run] would put secret ${name}`);
    return true;
  }
  const r = spawnSync(
    "npx",
    [
      "wrangler",
      "pages",
      "secret",
      "put",
      name,
      "--project-name",
      PROJECT,
    ],
    {
      input: value,
      encoding: "utf8",
      shell: true,
      cwd: ROOT,
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
  return (r.status ?? 1) === 0;
}

function uploadSecrets(env) {
  const ok = [];
  const failed = [];
  const skipped = [];
  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (!value) {
      skipped.push(key);
      continue;
    }
    console.log(`Uploading secret: ${key}`);
    if (putSecret(key, value)) ok.push(key);
    else failed.push(key);
  }
  console.log(`Secrets uploaded: ${ok.length}`);
  if (skipped.length) console.log(`Secrets skipped (missing): ${skipped.join(", ")}`);
  if (failed.length) {
    console.error(`Secrets failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

if (!fs.existsSync(ENV_FILE)) {
  console.error(`Missing ${ENV_FILE}. Run: npx vercel env pull .env.vercel.local --environment=production`);
  process.exit(1);
}

const env = parseEnvFile(ENV_FILE);
console.log(`Loaded ${Object.keys(env).length} keys from ${ENV_FILE}`);
console.log(`Cloudflare Pages project: ${PROJECT}`);

if (!secretsOnly) writeWranglerVars(env);
if (!varsOnly) uploadSecrets(env);

console.log("Done.");
