import { describe, expect, it } from 'vitest';
import {
  cronHealthCode,
  currentFinanceIncidents,
  generationIncidentsFromPlans,
  summariseFanoutState,
  withRegisteredCronJobs,
  type FinanceAutomationStateRow,
} from './health-state';

describe('operations health state', () => {
  it('uses the same grace rule for healthy, late, failed, and never-run jobs', () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const base = {
      job_name: 'example',
      expected_interval_minutes: 60,
      last_finished_at: '2026-08-13T10:45:00.000Z',
      next_expected_at: '2026-08-13T11:45:00.000Z',
      consecutive_failures: 0,
    };
    expect(cronHealthCode(base, now)).toBe('healthy');
    expect(cronHealthCode({ ...base, next_expected_at: '2026-08-13T11:44:00.000Z' }, now)).toBe('late');
    expect(cronHealthCode({ ...base, consecutive_failures: 1 }, now)).toBe('failing');
    expect(cronHealthCode({ ...base, last_finished_at: null }, now)).toBe('never_run');
  });

  it('adds every registered monitored job that has never recorded a run', () => {
    const rows = withRegisteredCronJobs([]);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((row) => row.never_run && row.last_finished_at === null)).toBe(true);
    expect(rows.every((row) => row.job_label && row.schedule && row.purpose && row.trigger)).toBe(true);
  });

  it('adds registry guidance to persisted health rows', () => {
    const [row] = withRegisteredCronJobs([{
      job_name: 'process-notifications',
      expected_interval_minutes: 1,
      last_finished_at: '2026-08-13T11:59:00.000Z',
      next_expected_at: '2026-08-13T12:00:00.000Z',
      consecutive_failures: 0,
    }]).filter((item) => item.job_name === 'process-notifications');
    expect(row).toMatchObject({
      job_label: 'Send waiting messages',
      trigger: 'external',
    });
    expect(row.purpose).toContain('Email queue');
  });

  it('removes historical finance failures after the same work succeeds', () => {
    const row = (partial: Partial<FinanceAutomationStateRow>): FinanceAutomationStateRow => ({
      id: crypto.randomUUID(),
      stream: 'invoice',
      action: 'send_reminder',
      entity_id: 'invoice-1',
      channel: 'email',
      status: 'failed',
      error: 'provider timeout',
      created_at: '2026-08-13T10:00:00.000Z',
      ...partial,
    });
    const incidents = currentFinanceIncidents([
      row({ id: 'old-failure' }),
      row({ id: 'success', status: 'success', error: null, created_at: '2026-08-13T10:05:00.000Z' }),
      row({ id: 'blocked', entity_id: 'invoice-2', status: 'skipped', error: 'retry_limit', created_at: '2026-08-13T11:00:00.000Z' }),
    ]);
    expect(incidents.map((item) => item.id)).toEqual(['blocked']);
  });

  it('turns dispatcher records and generation metadata into current incident counts', () => {
    expect(summariseFanoutState([{ key: 'host', value: { result: { first: 'ok', second: 'unreachable:timeout' } } }]).failing)
      .toHaveLength(1);
    expect(generationIncidentsFromPlans([{
      id: 'plan-1',
      metadata: { last_generation_errors: { lessons: [], assignments: [{ week: 2 }] } },
    }])).toEqual([expect.objectContaining({ planId: 'plan-1', type: 'assignments', failures: 1 })]);
  });
});
