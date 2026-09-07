import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateContainerCostPolicy(config) {
  const errors = [];
  const containers = config.containers ?? [];
  if (containers.length !== 1) errors.push('Exactly one container application is allowed.');
  for (const container of containers) {
    if (container.class_name !== 'NextAppContainer') errors.push('Unexpected container class.');
    if (container.instance_type !== 'basic') errors.push('Container must use basic (1 GiB), not a larger or custom instance.');
    if (container.max_instances !== 1) errors.push('Container max_instances must be exactly 1.');
  }
  if (config.triggers?.crons?.length) errors.push('Cloudflare cron triggers are forbidden: cron-job.org owns scheduling.');
  if (String(config.vars?.CLOUDFLARE_OWNS_CRON) !== 'false') errors.push('CLOUDFLARE_OWNS_CRON must stay false.');
  return errors;
}

export function validateLiveContainerCostPolicy(app) {
  const errors = [];
  if (app.max_instances !== 1) errors.push(`Live maximum instances is ${app.max_instances}, expected 1.`);
  if (app.configuration?.memory_mib !== 1024) errors.push('Live container must reserve exactly 1024 MiB memory.');
  if (app.configuration?.vcpu !== 0.25) errors.push('Live container must use basic CPU allocation (0.25 vCPU).');
  if (app.configuration?.disk?.size_mb > 4000 || !app.configuration?.disk?.size_mb) errors.push('Live container disk exceeds the basic 4 GB limit or is unknown.');
  return errors;
}

export async function checkContainerCostPolicy() {
  // Use the deployment tool's parser: comments, alternate TOML syntax and typed
  // values cannot fool a text-pattern check. No network or credentials required.
  const { unstable_readConfig } = await import('wrangler');
  const config = unstable_readConfig({ config: path.join(root, 'wrangler.toml') });
  const errors = validateContainerCostPolicy(config);
  const gateway = readFileSync(path.join(root, 'src/cloudflare/container-gateway.ts'), 'utf8');
  if (!gateway.includes('sleepAfter = "5s"')) errors.push('The five-second idle default has changed. Review the cost policy before deployment.');
  if (!gateway.includes('override async onActivityExpired()')) errors.push('Background-aware idle protection is missing.');
  if (errors.length) throw new Error(`Container cost policy BLOCKED deployment:\n- ${errors.join('\n- ')}`);
  console.log('Container cost policy passed: one basic instance, short idle sleep, cron-job.org scheduling.');
  console.log('Resource guard only: this does not enforce a $5 billing cap.');
}

async function checkLive() {
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'containers', 'info',
    'a0303920-f8b2-460a-b86f-089aa14015f8',
  ], { encoding: 'utf8', env: process.env, maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Live cost verification failed: Cloudflare access was rejected or unavailable.');
  let app;
  try { app = JSON.parse(result.stdout); }
  catch { throw new Error('Live cost verification failed: unexpected Cloudflare response.'); }
  const errors = validateLiveContainerCostPolicy(app);
  if (errors.length) throw new Error(`Live container cost policy FAILED:\n- ${errors.join('\n- ')}`);
  console.log('Live cost policy verified: maximum one instance, 1 GiB memory, 0.25 vCPU, at most 4 GB disk.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--live')) await checkLive();
    else await checkContainerCostPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cost-policy verification failed.');
    process.exitCode = 1;
  }
}
