#!/usr/bin/env node
/**
 * Sync local env files → Cloudflare Workers:
 * - Public / build-time vars → wrangler.toml [vars]
 * - Secrets → wrangler secret put
 *
 * Sources, lowest precedence first: .env → .env.local → .env.production.local
 *
 * Usage: node scripts/sync-cloudflare-env.mjs
 * Optional: --vars-only | --secrets-only | --dry-run | --allow-placeholders
 *
 * HISTORY — why the placeholder guard exists:
 * This script used to read `.env.vercel.local` LAST, so it won whenever a key
 * existed in more than one file. `vercel env pull` writes the literal string
 * "[SENSITIVE]" for any var marked sensitive, so ten real credentials (Upstash,
 * LiveKit, Resend, Firebase) were overwritten with that placeholder and uploaded
 * to Cloudflare. Public receipt upload 500'd for as long as it took to notice.
 * Nothing that looks like a placeholder may ever reach Cloudflare again.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = process.env.CF_WORKER_NAME || "rillcodwebsite";
const WRANGLER = path.join(ROOT, "wrangler.toml");

/** Lowest precedence first — later files win. */
const SOURCE_FILES = [".env", ".env.local", ".env.production.local"];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const varsOnly = args.has("--vars-only");
const secretsOnly = args.has("--secrets-only");
const allowPlaceholders = args.has("--allow-placeholders");

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
  // Keep in step with CONTAINER_ENV_KEYS in src/cloudflare/container-gateway.ts.
  // A key that syncs but is not forwarded (or forwarded but never synced) is
  // invisible either way: the rotation quietly runs on fewer keys than intended.
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_2",
  "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4",
  "GEMINI_API_KEY_5",
  "GEMINI_API_KEYS",
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
  // Meta WhatsApp Cloud API. WHATSAPP_APP_SECRET signs inbound webhooks — without
  // it every unsigned webhook is rejected, so inbound WhatsApp goes dark.
  "WHATSAPP_APP_SECRET",
  // An account identifier rather than a credential, but it stays a secret so it
  // does not land in wrangler.toml, which is committed.
  "WHATSAPP_PHONE_NUMBER_ID",
  // Jitsi-as-a-Service token minting (/api/live-sessions/jaas-token).
  "JAAS_APP_ID",
  "JAAS_KEY_ID",
  "JAAS_PRIVATE_KEY",
];

/** Host-injected build metadata that must never be synced anywhere. */
const IGNORED_KEY_PREFIXES = [/^VERCEL/, /^NX_/, /^TURBO_/, /^CF_PAGES/];

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
    // Multi-line secrets (service-account JSON, PEM keys) are stored escaped
    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    if (IGNORED_KEY_PREFIXES.some((re) => re.test(key))) continue;
    env[key] = value;
  }
  return env;
}

/**
 * A value that is syntactically present but semantically empty. Uploading one
 * is worse than uploading nothing: the app's "is it configured?" checks pass
 * and the failure surfaces later, in production, as a confusing runtime error.
 */
function placeholderReason(key, value) {
  if (/^\[.*\]$/.test(value)) return `looks like a placeholder (${value})`;
  if (/^(undefined|null|changeme|todo|xxx+)$/i.test(value)) {
    return `looks like a stub (${value})`;
  }
  if (key.endsWith("_URL") && !/^(https?|wss?):\/\//i.test(value)) {
    return "is not a URL (expected https://, http:// or wss://)";
  }
  return null;
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
    ["wrangler", "secret", "put", name, "--name", PROJECT],
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

// ── Load ──────────────────────────────────────────────────────────────────────

const env = {};
let loadedAny = false;
for (const candidate of SOURCE_FILES) {
  const resolved = path.resolve(ROOT, candidate);
  if (!fs.existsSync(resolved)) continue;
  loadedAny = true;
  const parsed = parseEnvFile(resolved);
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && value !== "") env[key] = value;
  }
  console.log(`Loaded ${Object.keys(parsed).length} keys from ${candidate}`);
}

if (!loadedAny) {
  console.error(`No env file found. Expected one of: ${SOURCE_FILES.join(", ")}`);
  process.exit(1);
}

// ── Guard ─────────────────────────────────────────────────────────────────────

const bad = [];
for (const key of [...PUBLIC_KEYS, ...SECRET_KEYS]) {
  const value = env[key];
  if (!value) continue;
  const reason = placeholderReason(key, value);
  if (reason) bad.push({ key, reason });
}

if (bad.length) {
  console.error("\nRefusing to sync — these values are not real credentials:");
  for (const { key, reason } of bad) console.error(`  ${key}: ${reason}`);
  console.error(
    "\nFetch the real value from the provider's console and put it in .env.local.\n" +
      "Override with --allow-placeholders only if you truly mean to upload these."
  );
  if (!allowPlaceholders) process.exit(1);
  console.error("--allow-placeholders set; continuing anyway.\n");
}

console.log(`Merged to ${Object.keys(env).length} keys`);
console.log(`Cloudflare Workers project: ${PROJECT}`);

if (!secretsOnly) writeWranglerVars(env);
if (!varsOnly) uploadSecrets(env);

console.log("Done.");
