import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFICE_AUTOMATION_CONTROLS, parseOfficeAutomationControls } from './automation-controls';

describe('office automation controls', () => {
  it('merges a stored partial configuration with safe known defaults', () => {
    expect(parseOfficeAutomationControls('{"marketing_enabled":false}')).toEqual({
      ...DEFAULT_OFFICE_AUTOMATION_CONTROLS,
      marketing_enabled: false,
    });
  });

  it('keeps the marketing master independent from child switch values', () => {
    const controls = parseOfficeAutomationControls({
      marketing_enabled: false,
      lead_nurture_enabled: true,
      form_followup_enabled: true,
    });
    expect(controls.marketing_enabled).toBe(false);
    expect(controls.lead_nurture_enabled).toBe(true);
    expect(controls.form_followup_enabled).toBe(true);
  });

  it('rejects malformed or non-boolean controls so cron delivery can fail closed', () => {
    expect(() => parseOfficeAutomationControls('not-json')).toThrow('invalid');
    expect(() => parseOfficeAutomationControls({ customer_followup_enabled: 'yes' })).toThrow('must be true or false');
  });
});
