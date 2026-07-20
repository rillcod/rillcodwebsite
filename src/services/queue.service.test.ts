import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpush: vi.fn(),
  lpop: vi.fn(),
  llen: vi.fn(),
  recordDeadLetter: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    rpush = mocks.rpush;
    lpop = mocks.lpop;
    llen = mocks.llen;
  },
}));
vi.mock('@/config/env', () => ({
  env: { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'test-token' },
}));
vi.mock('@/lib/operations/dead-letter', () => ({ recordDeadLetter: mocks.recordDeadLetter }));

import { QueueService } from './queue.service';

describe('notification queue recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues normally without creating a recovery item', async () => {
    mocks.rpush.mockResolvedValueOnce(1);
    const id = await new QueueService().queueNotification('user-1', 'email', { subject: 'Hello' });
    expect(id).toBeTruthy();
    expect(mocks.rpush).toHaveBeenCalledOnce();
    expect(mocks.recordDeadLetter).not.toHaveBeenCalled();
  });

  it('preserves the full job when Redis rejects the write', async () => {
    mocks.rpush.mockRejectedValueOnce(new Error('Redis unavailable'));
    mocks.recordDeadLetter.mockResolvedValueOnce('dead-letter-1');
    const id = await new QueueService().queueNotification('user-1', 'email', { subject: 'Hello' }, 2);
    expect(id).toBeTruthy();
    expect(mocks.recordDeadLetter).toHaveBeenCalledWith(expect.objectContaining({
      source: 'notification_queue_error', userId: 'user-1', attempts: 2,
      payload: { subject: 'Hello' }, error: 'Redis unavailable',
    }));
  });

  it('returns an explicit failure if both queue and recovery storage fail', async () => {
    mocks.rpush.mockRejectedValueOnce(new Error('Redis unavailable'));
    mocks.recordDeadLetter.mockResolvedValueOnce(null);
    await expect(new QueueService().queueNotification('user-1', 'email', { subject: 'Hello' }))
      .rejects.toThrow('Notification queue and recovery storage failed');
  });
});
