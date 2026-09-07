import { describe, it, expect } from 'vitest';
import { validateContainerCostPolicy, validateLiveContainerCostPolicy } from '../../../scripts/check-container-cost-policy.mjs';

const allowed = { containers: [{ class_name: 'NextAppContainer', instance_type: 'basic', max_instances: 1 }], vars: { CLOUDFLARE_OWNS_CRON: 'false' } };
describe('deployment cost policy', () => {
  it('accepts the agreed small deployment', () => {
    expect(validateContainerCostPolicy(allowed)).toEqual([]);
  });
  it('blocks the actual expensive production configuration', () => {
    expect(validateContainerCostPolicy({ ...allowed, containers: [{ ...allowed.containers[0], instance_type: 'standard-2', max_instances: 5 }] })).toHaveLength(2);
    expect(validateLiveContainerCostPolicy({ max_instances: 5, configuration: { memory_mib: 6144, vcpu: 1, disk: { size_mb: 12000 } } })).toHaveLength(4);
  });
  it('blocks missing limits, custom sizes, multiple applications and duplicate scheduling', () => {
    for (const container of [{ class_name: 'NextAppContainer' }, { ...allowed.containers[0], instance_type: { memory_mib: 6144 } }]) {
      expect(validateContainerCostPolicy({ ...allowed, containers: [container] }).length).toBeGreaterThan(0);
    }
    expect(validateContainerCostPolicy({ ...allowed, containers: [...allowed.containers, ...allowed.containers] }).length).toBeGreaterThan(0);
    expect(validateContainerCostPolicy({ ...allowed, triggers: { crons: ['* * * * *'] } }).length).toBeGreaterThan(0);
    expect(validateContainerCostPolicy({ ...allowed, vars: { CLOUDFLARE_OWNS_CRON: 'true' } }).length).toBeGreaterThan(0);
  });
  it('requires real deployment evidence, not a missing or partial response', () => {
    expect(validateLiveContainerCostPolicy({}).length).toBeGreaterThan(0);
    expect(validateLiveContainerCostPolicy({ max_instances: 1, configuration: { memory_mib: 1024, vcpu: 0.25, disk: { size_mb: 4000 } } })).toEqual([]);
  });
});
