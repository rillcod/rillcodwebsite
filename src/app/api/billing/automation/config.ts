/**
 * Shared billing automation config types and defaults.
 * Kept separate from route.ts because Next.js only allows HTTP-method
 * exports (GET, POST, …) from route files.
 */

export interface BillingAutomationConfig {
  invoice_reminders_enabled: boolean;
  finance_messages_enabled: boolean;
  billing_cycle_reminders_enabled: boolean;
  reminder_1_days_after_issue: number; // send X days after invoice created
  reminder_2_days_before_due: number;  // send X days before due date
  reminder_3_days_after_due: number;   // send X days after due = final/overdue
  auto_overdue_enabled: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
  notify_whatsapp: boolean;
}

export const DEFAULT_CONFIG: BillingAutomationConfig = {
  invoice_reminders_enabled: true,
  finance_messages_enabled: true,
  billing_cycle_reminders_enabled: true,
  reminder_1_days_after_issue: 1,
  reminder_2_days_before_due: 3,
  reminder_3_days_after_due: 1,
  auto_overdue_enabled: true,
  notify_email: true,
  notify_in_app: true,
  notify_whatsapp: true,
};

export type BillingAutomationConfigParseResult =
  | { ok: true; config: BillingAutomationConfig }
  | { ok: false; error: string };

function boundedWholeDays(value: unknown, fallback: number, field: string) {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return { ok: false as const, error: `${field} must be a number from 0 to 365` };
  }
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(candidate) || candidate < 0 || candidate > 365) {
    return { ok: false as const, error: `${field} must be a number from 0 to 365` };
  }
  return { ok: true as const, value: Math.round(candidate) };
}

/**
 * One validator for the dashboard and every scheduled finance job. This keeps
 * corrupt/null cadence values out of the authoritative settings row.
 */
export function parseBillingAutomationConfig(
  value: unknown,
): BillingAutomationConfigParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Billing automation settings must be an object' };
  }
  const input = value as Record<string, unknown>;
  const reminder1 = boundedWholeDays(
    input.reminder_1_days_after_issue,
    DEFAULT_CONFIG.reminder_1_days_after_issue,
    'reminder_1_days_after_issue',
  );
  if (!reminder1.ok) return reminder1;
  const reminder2 = boundedWholeDays(
    input.reminder_2_days_before_due,
    DEFAULT_CONFIG.reminder_2_days_before_due,
    'reminder_2_days_before_due',
  );
  if (!reminder2.ok) return reminder2;
  const reminder3 = boundedWholeDays(
    input.reminder_3_days_after_due,
    DEFAULT_CONFIG.reminder_3_days_after_due,
    'reminder_3_days_after_due',
  );
  if (!reminder3.ok) return reminder3;

  return {
    ok: true,
    config: {
      invoice_reminders_enabled:
        input.invoice_reminders_enabled === undefined
          ? DEFAULT_CONFIG.invoice_reminders_enabled
          : input.invoice_reminders_enabled === true,
      finance_messages_enabled:
        input.finance_messages_enabled === undefined
          ? DEFAULT_CONFIG.finance_messages_enabled
          : input.finance_messages_enabled === true,
      billing_cycle_reminders_enabled:
        input.billing_cycle_reminders_enabled === undefined
          ? DEFAULT_CONFIG.billing_cycle_reminders_enabled
          : input.billing_cycle_reminders_enabled === true,
      reminder_1_days_after_issue: reminder1.value,
      reminder_2_days_before_due: reminder2.value,
      reminder_3_days_after_due: reminder3.value,
      auto_overdue_enabled:
        input.auto_overdue_enabled === undefined
          ? DEFAULT_CONFIG.auto_overdue_enabled
          : input.auto_overdue_enabled === true,
      notify_email:
        input.notify_email === undefined
          ? DEFAULT_CONFIG.notify_email
          : input.notify_email === true,
      notify_in_app:
        input.notify_in_app === undefined
          ? DEFAULT_CONFIG.notify_in_app
          : input.notify_in_app === true,
      notify_whatsapp:
        input.notify_whatsapp === undefined
          ? DEFAULT_CONFIG.notify_whatsapp
          : input.notify_whatsapp === true,
    },
  };
}
