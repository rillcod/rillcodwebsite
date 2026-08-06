/**
 * Credentials for the one-off maintenance scripts in this folder.
 *
 * Four scripts each carried the same live Supabase secret as a string literal,
 * committed to the repository. They now read it from the environment, and there
 * is a single place to change if that ever needs to move again.
 *
 * Reads .env.local when the variable is not already exported, so the scripts
 * still run with no extra setup on a machine that already has the project
 * configured — without the value living in git.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, '..', '.env.local');

let fileEnv = null;
function fromEnvFile(name) {
  if (fileEnv === null) {
    fileEnv = {};
    try {
      for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (match) fileEnv[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
      }
    } catch {
      // No .env.local — the environment is the only source, handled below.
    }
  }
  return fileEnv[name];
}

function require(name, hint) {
  const value = process.env[name] || fromEnvFile(name);
  if (!value) {
    console.error(
      `\nMissing ${name}.\n\n`
      + `  Set it in .env.local or export it before running this script.\n`
      + (hint ? `  ${hint}\n` : ''),
    );
    process.exit(1);
  }
  return value;
}

export const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
  || fromEnvFile('SUPABASE_PROJECT_REF')
  || 'akaorqukdoawacvxsdij';

/**
 * Token for the Supabase Management API (api.supabase.com).
 *
 * These scripts always used this against the Management API rather than the
 * database, so a management access token is what it actually needs. The old
 * literal was named SERVICE_ROLE_KEY, which is a different credential — that
 * name is still accepted so an existing .env.local keeps working.
 */
export function managementToken() {
  return process.env.SUPABASE_ACCESS_TOKEN
    || fromEnvFile('SUPABASE_ACCESS_TOKEN')
    || require('SUPABASE_SERVICE_ROLE_KEY', 'Create a token at https://supabase.com/dashboard/account/tokens');
}

/** Run SQL through the Management API and return the parsed response. */
export async function runSql(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managementToken()}`,
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
