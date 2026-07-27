import { describe, expect, it } from 'vitest';
import {
  monthlyCampaignKey,
  monthlyPeriodKey,
  monthlySendGuardKey,
} from './monthly-send-guard';

describe('monthly send guard keys', () => {
  it('builds a stable YYYY-MM period key', () => {
    expect(monthlyPeriodKey(new Date('2026-07-26T12:00:00Z'))).toBe('2026-07');
  });

  it('scopes redis + campaign keys by event, recipient, and month', () => {
    expect(monthlySendGuardKey('monthly_summary', ' Bekes@Mail.COM ', '2026-07')).toBe(
      'monthly_send:monthly_summary:bekes@mail.com:2026-07',
    );
    expect(monthlyCampaignKey('monthly_summary', '2026-07')).toBe('monthly_summary:2026-07');
  });
});
