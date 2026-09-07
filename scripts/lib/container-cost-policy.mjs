/** Pure validators shared by deployment and tests; no Wrangler runtime import. */
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
