import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseBillingAutomationConfig } from './config';

describe('parseBillingAutomationConfig', () => {
  it('uses shared defaults for missing optional values', () => {
    expect(parseBillingAutomationConfig({})).toEqual({
      ok: true,
      config: DEFAULT_CONFIG,
    });
  });

  it('normalizes whole-day cadence values and explicit switches', () => {
    const result = parseBillingAutomationConfig({
      finance_messages_enabled: false,
      notify_email: false,
      reminder_1_days_after_issue: 2.4,
      reminder_2_days_before_due: '5',
      reminder_3_days_after_due: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({
      finance_messages_enabled: false,
      notify_email: false,
      reminder_1_days_after_issue: 2,
      reminder_2_days_before_due: 5,
      reminder_3_days_after_due: 0,
    });
  });

  it.each([NaN, Infinity, -1, 366, 'not-a-number', null])(
    'rejects an invalid cadence value: %s',
    (value) => {
      const result = parseBillingAutomationConfig({ reminder_1_days_after_issue: value });
      expect(result.ok).toBe(false);
    },
  );

  it('rejects non-object payloads', () => {
    expect(parseBillingAutomationConfig(null).ok).toBe(false);
    expect(parseBillingAutomationConfig([]).ok).toBe(false);
  });
});
