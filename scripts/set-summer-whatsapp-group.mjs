#!/usr/bin/env node
/**
 * Set NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP everywhere we manage:
 * wrangler.toml [vars] (what production reads) plus .env and .env.local.
 *
 * Usage: node scripts/set-summer-whatsapp-group.mjs [url]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const groupUrl =
  process.argv[2]?.trim() ||
  "https://chat.whatsapp.com/GHpWqij1epR4m0Y4HuKGfz";
const KEY = "NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP";

function updateToml() {
  const file = path.join(ROOT, "wrangler.toml");
  let text = fs.readFileSync(file, "utf8");
  const line = `${KEY} = ${JSON.stringify(groupUrl)}`;
  if (new RegExp(`^${KEY}\\s*=`, "m").test(text)) {
    text = text.replace(new RegExp(`^${KEY}\\s*=.*$`, "m"), line);
  } else if (/\[vars\]/.test(text)) {
    text = text.replace(/\[vars\]\n/, `[vars]\n${line}\n`);
  } else {
    text = `${text.trimEnd()}\n\n[vars]\n${line}\n`;
  }
  fs.writeFileSync(file, text, "utf8");
  console.log("Updated wrangler.toml");
}

function updateEnvFile(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`Skip missing ${rel}`);
    return;
  }
  let text = fs.readFileSync(file, "utf8");
  const line = `${KEY}=${JSON.stringify(groupUrl)}`;
  if (new RegExp(`^${KEY}=`, "m").test(text)) {
    text = text.replace(new RegExp(`^${KEY}=.*$`, "m"), line);
  } else {
    text = `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(file, text, "utf8");
  console.log(`Updated ${rel}`);
}

try {
  // eslint-disable-next-line no-new
  new globalThis.URL(groupUrl);
} catch {
  console.error("Invalid URL:", groupUrl);
  process.exit(1);
}

console.log("Setting", KEY, "→", groupUrl);
updateToml();
// .env and .env.local are kept identical on purpose — update both.
updateEnvFile(".env");
updateEnvFile(".env.local");
console.log(
  "\nDone locally. This is a NEXT_PUBLIC_ var, so it is baked into the image at build time:\n" +
    "  npm run deploy      (or push to main and let the Deploy Cloudflare action run)",
);
