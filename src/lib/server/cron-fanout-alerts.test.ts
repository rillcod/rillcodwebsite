import { describe, expect, it } from 'vitest';
import { describeFanoutStatus, formatFanoutFailureSummary } from './cron-fanout-alerts';

describe('fan-out failure copy', () => {
  it('explains unreachable and http statuses in plain language', () => {
    expect(describeFanoutStatus('ok')).toContain('success');
    expect(describeFanoutStatus('http_401')).toContain('401');
    expect(describeFanoutStatus('unreachable:ECONNREFUSED')).toContain('could not reach');
  });

  it('structures admin alerts so they are not confused with cron-job.org enable emails', () => {
    const { title, message } = formatFanoutFailureSummary('onboarding-sweep', [
      ['academic-readiness', 'unreachable:ECONNREFUSED'],
      ['auto-generate-content', 'http_500'],
    ]);
    expect(title).toContain('onboarding-sweep');
    expect(message).toContain('not on cron-job.org');
    expect(message).toContain('academic-readiness');
    expect(message).toContain('Operations Health');
  });
});
