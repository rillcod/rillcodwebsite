import { describe, it, expect, vi, beforeEach } from 'vitest';
const schedule = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ after: schedule }));
import { after } from './after';
import { backgroundWorkPending } from './background-work';

describe('background work ownership', () => {
  beforeEach(() => { schedule.mockReset(); });
  it('protects queued work before the response and releases it only on completion', async () => {
    let complete!: () => void;
    after(() => new Promise<void>(resolve => { complete = resolve; }));
    expect(backgroundWorkPending()).toBe(1);
    const running = schedule.mock.calls[0][0]();
    expect(backgroundWorkPending()).toBe(1);
    complete();
    await running;
    expect(backgroundWorkPending()).toBe(0);
  });
  it('releases failed callbacks and failed registrations', async () => {
    after(() => { throw new Error('task failed'); });
    await expect(schedule.mock.calls[0][0]()).rejects.toThrow('task failed');
    expect(backgroundWorkPending()).toBe(0);
    schedule.mockImplementation(() => { throw new Error('registration failed'); });
    expect(() => after(() => {})).toThrow('registration failed');
    expect(backgroundWorkPending()).toBe(0);
  });
  it('keeps nested work protected after the parent finishes', async () => {
    after(() => { after(() => {}); });
    await schedule.mock.calls[0][0]();
    expect(backgroundWorkPending()).toBe(1);
    await schedule.mock.calls[1][0]();
    expect(backgroundWorkPending()).toBe(0);
  });
});
