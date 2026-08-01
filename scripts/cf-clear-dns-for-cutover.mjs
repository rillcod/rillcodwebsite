#!/usr/bin/env node
/**
 * Remove conflicting Cloudflare DNS records so Worker custom domains can attach.
 * Deletes A/CNAME for www, @, and apex — Wrangler recreates them on deploy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const zoneName = process.env.CF_ZONE_NAME || "rillcod.com";
const hosts = (process.env.CF_DNS_HOSTS || "www,rillcod.com,@").split(",").map((h) => h.trim());

function wranglerConfigPath() {
  const win = path.join(process.env.APPDATA || "", "xdg.config", ".wrangler", "config", "default.toml");
  const unix = path.join(os.homedir(), ".config", "xdg.config", ".wrangler", "config", "default.toml");
  return fs.existsSync(win) ? win : unix;
}

function readToken() {
  const file = wranglerConfigPath();
  const cfg = fs.readFileSync(file, "utf8");
  const m = cfg.match(/oauth_token = "([^"]+)"/);
  if (!m) throw new Error("No wrangler oauth token — run: npx wrangler login");
  return m[1];
}

async function cf(apiPath, { method = "GET", body } = {}) {
  const token = readToken();
  const res = await fetch(`https://api.cloudflare.com/client/v4${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(JSON.stringify(json.errors || json));
  }
  return json.result;
}

const zones = await cf(`/zones?name=${zoneName}`);
const zone = zones?.[0];
if (!zone) throw new Error(`Zone not found: ${zoneName}`);

console.log(`Zone ${zoneName} (${zone.id})`);

for (const host of hosts) {
  const name = host === "@" || host === zoneName ? zoneName : `${host}.${zoneName}`;
  const records = await cf(`/zones/${zone.id}/dns_records?name=${name}`);
  const conflicting = records.filter((r) => ["A", "AAAA", "CNAME"].includes(r.type));
  if (!conflicting.length) {
    console.log(`  ${name}: no A/CNAME records to remove`);
    continue;
  }
  for (const rec of conflicting) {
    console.log(`  DELETE ${rec.type} ${rec.name} → ${rec.content}`);
    await cf(`/zones/${zone.id}/dns_records/${rec.id}`, { method: "DELETE" });
  }
}

console.log("\nDNS cleared. Re-run: npm run cf:set-route");
