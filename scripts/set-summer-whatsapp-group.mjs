#!/usr/bin/env node
/**
 * Set NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP everywhere we manage.
 * Usage: node scripts/set-summer-whatsapp-group.mjs [url]
 */
import { spawnSync } from "child_process";
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

function vercelRm(envName) {
  const r = spawnSync(
    "npx",
    ["vercel", "env", "rm", KEY, envName, "--yes"],
    { cwd: ROOT, encoding: "utf8", shell: true, stdio: "inherit" }
  );
  return r.status === 0;
}

function vercelAdd(envName) {
  const r = spawnSync(
    "npx",
    ["vercel", "env", "add", KEY, envName, "--value", groupUrl, "--yes"],
    { cwd: ROOT, encoding: "utf8", shell: true, stdio: "inherit" }
  );
  if (r.status === 0) return true;
  // Older CLI may not support --value; fall back to stdin
  const r2 = spawnSync(
    "npx",
    ["vercel", "env", "add", KEY, envName],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
      input: `${groupUrl}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
  return r2.status === 0;
}

function syncVercel() {
  for (const envName of ["production", "preview", "development"]) {
    console.log(`Vercel ${envName}: removing old ${KEY} (if any)...`);
    vercelRm(envName);
    console.log(`Vercel ${envName}: adding ${KEY}...`);
    if (!vercelAdd(envName)) {
      console.error(`Failed to set Vercel ${envName}`);
      process.exitCode = 1;
    }
  }
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
updateEnvFile(".env.vercel.local");
updateEnvFile(".env.local");
syncVercel();
console.log("Done.");
