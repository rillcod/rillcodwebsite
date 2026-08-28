import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canReplayContainerRequest,
  classifyContainerFailure,
} from './container-request-recovery';

describe('classifyContainerFailure', () => {
  it('recognises the stopped-container race shown to customers', () => {
    expect(
      classifyContainerFailure(
        500,
        'Error proxying request to container: The container is not running, consider calling start()',
      ),
    ).toBe('retryable');
  });

  it('recognises capacity failures without treating them as safe to retry', () => {
    expect(
      classifyContainerFailure(503, 'There is no Container instance available at this time.'),
    ).toBe('unavailable');
  });

  it('does not hide an application error', () => {
    expect(classifyContainerFailure(500, 'The invoice renderer failed validation')).toBeNull();
    expect(classifyContainerFailure(404, 'Error proxying request to container')).toBeNull();
  });
});

describe('canReplayContainerRequest', () => {
  function request(method: string, pathname = '/dashboard', upgrade?: string) {
    return new Request(`https://www.rillcod.com${pathname}`, {
      method,
      headers: upgrade ? { upgrade } : undefined,
    });
  }

  it('allows ordinary read-only navigation and asset requests', () => {
    expect(canReplayContainerRequest(request('GET'))).toBe(true);
    expect(canReplayContainerRequest(request('HEAD'))).toBe(true);
    expect(canReplayContainerRequest(request('OPTIONS'))).toBe(true);
  });

  it('never replays a write, a websocket, or a cron execution', () => {
    expect(canReplayContainerRequest(request('POST'))).toBe(false);
    expect(canReplayContainerRequest(request('GET', '/live', 'websocket'))).toBe(false);
    expect(canReplayContainerRequest(request('GET', '/api/cron/academic-readiness'))).toBe(false);
  });
});

describe('production gateway wiring', () => {
  const gateway = readFileSync(
    path.join(process.cwd(), 'src/cloudflare/container-gateway.ts'),
    'utf8',
  );

  it('keeps cost-aware scale-to-zero while handling the restart race', () => {
    expect(gateway).toContain('sleepAfter = "3m"');
    expect(gateway).toContain('classifyContainerFailure');
    expect(gateway).toContain('startAndWaitForPorts');
    expect(gateway).toContain('containerUnavailableResponse');
  });
});
