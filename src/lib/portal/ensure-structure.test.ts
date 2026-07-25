import { describe, expect, it, vi } from 'vitest';
import { clampActiveFlag } from './ensure-structure';

vi.mock('@/lib/classes/resolve-or-create', () => ({
  resolveClassForStudent: vi.fn(async () => ({ id: 'class-1', name: 'General Placement' })),
}));

describe('clampActiveFlag', () => {
  it('blocks active students without class', () => {
    const r = clampActiveFlag('student', { schoolId: 's1', classId: null, wantActive: true });
    expect(r.isActive).toBe(false);
    expect(r.error).toMatch(/class/i);
  });

  it('allows parents with school only', () => {
    const r = clampActiveFlag('parent', { schoolId: 's1', wantActive: true });
    expect(r.isActive).toBe(true);
    expect(r.error).toBeNull();
  });

  it('allows inactive incomplete profiles', () => {
    const r = clampActiveFlag('teacher', { schoolId: null, wantActive: false });
    expect(r.isActive).toBe(false);
    expect(r.error).toBeNull();
  });
});
