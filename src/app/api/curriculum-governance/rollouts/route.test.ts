import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireGovernanceActor, createAdminClient, logAudit } = vi.hoisted(() => ({
  requireGovernanceActor: vi.fn(),
  createAdminClient: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/curriculum/governance-server', () => ({
  applyCurriculumRollout: vi.fn(),
  previewCurriculumRollout: vi.fn(),
  requireGovernanceActor,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('@/lib/audit/log', () => ({ logAudit }));

function request(body: unknown) {
  return new NextRequest('http://localhost/api/curriculum-governance/rollouts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('curriculum rollout update choice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGovernanceActor.mockResolvedValue({ id: 'admin-1', role: 'admin', school_id: null });
    logAudit.mockResolvedValue(true);
  });

  it('keeps the update choice with administrators', async () => {
    requireGovernanceActor.mockResolvedValue({ id: 'teacher-1', role: 'teacher', school_id: 'school-1' });
    const { PATCH } = await import('./route');
    const response = await PATCH(request({ adoption_id: 'adoption-1', auto_update: false }));
    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('requires an explicit boolean choice', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(request({ adoption_id: 'adoption-1', auto_update: 'false' }));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('saves and audits the school preference without touching class plans', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'adoption-1', school_id: 'school-1', course_id: 'course-1',
        release_id: 'release-1', auto_update: true, status: 'active',
      },
      error: null,
    });
    const readEq = vi.fn(() => ({ maybeSingle }));
    const selectCurrent = vi.fn(() => ({ eq: readEq }));
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'adoption-1', school_id: 'school-1', course_id: 'course-1',
        release_id: 'release-1', auto_update: false, status: 'active',
      },
      error: null,
    });
    const selectUpdated = vi.fn(() => ({ single }));
    const updateEq = vi.fn(() => ({ select: selectUpdated }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn(() => ({ select: selectCurrent, update }));
    createAdminClient.mockReturnValue({ from });

    const { PATCH } = await import('./route');
    const response = await PATCH(request({ adoption_id: 'adoption-1', auto_update: false }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ auto_update: false }));
    expect(from).toHaveBeenCalledTimes(2);
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'change_curriculum_auto_update',
      resourceId: 'adoption-1',
      oldValue: 'Automatic curriculum updates',
      newValue: 'Manual curriculum updates',
    }));
    expect(body.message).toContain('stay on its current edition');
  });
});
