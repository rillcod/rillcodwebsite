import { describe, expect, it } from 'vitest';
import { computeQueueFlags, shouldCreateAutoEscalation } from './queue-automation';

describe('queue automation flags', () => {
  it('marks overdue non-closed conversations', () => {
    const flags = computeQueueFlags({
      sla_due_at: '2026-01-01T00:00:00.000Z',
      status: 'open',
      assigned_staff_id: 'staff-1',
      open_reports: 0,
      now_iso: '2026-01-02T00:00:00.000Z',
    });
    expect(flags.isOverdue).toBe(true);
    expect(flags.needsEscalation).toBe(true);
  });

  it('does not mark closed conversation overdue', () => {
    const flags = computeQueueFlags({
      sla_due_at: '2026-01-01T00:00:00.000Z',
      status: 'closed',
      assigned_staff_id: null,
      open_reports: 0,
      now_iso: '2026-01-02T00:00:00.000Z',
    });
    expect(flags.isOverdue).toBe(false);
    expect(flags.isUnassigned).toBe(true);
  });

  it('escalates on report threshold even when not overdue', () => {
    const flags = computeQueueFlags({
      sla_due_at: null,
      status: 'open',
      assigned_staff_id: 'staff-1',
      open_reports: 2,
      now_iso: '2026-01-02T00:00:00.000Z',
    });
    expect(flags.needsEscalation).toBe(true);
    expect(shouldCreateAutoEscalation({ needs_escalation: flags.needsEscalation, open_reports: 2 })).toBe(true);
  });

  it('does not auto-create escalation for overdue-only branch', () => {
    expect(shouldCreateAutoEscalation({ needs_escalation: true, open_reports: 1 })).toBe(false);
  });
});
