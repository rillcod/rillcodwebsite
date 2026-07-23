import { describe, expect, it } from 'vitest';
import { pipelineStageForKnownParent } from '@/lib/crm/resolve-parent-stage';

describe('pipelineStageForKnownParent', () => {
  it('marks linked portal parents as won', () => {
    expect(pipelineStageForKnownParent(1)).toBe('won');
    expect(pipelineStageForKnownParent(3)).toBe('won');
  });

  it('marks portal account without linked child as active (contacted)', () => {
    expect(pipelineStageForKnownParent(0)).toBe('active');
  });
});
