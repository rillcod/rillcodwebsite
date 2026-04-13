/**
 * Shared billing automation config types and defaults.
 * Kept separate from route.ts because Next.js only allows HTTP-method
 * exports (GET, POST, …) from route files.
 */

export interface BillingAutomationConfig {
  invoice_reminders_enabled: boolean;
  reminder_1_days_after_issue: number; // send X days after invoice created
  reminder_2_days_before_due: number;  // send X days before due date
  reminder_3_days_after_due: number;   // send X days after due = final/overdue
  auto_overdue_enabled: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
}

export const DEFAULT_CONFIG: BillingAutomationConfig = {
  invoice_reminders_enabled: true,
  reminder_1_days_after_issue: 1,
  reminder_2_days_before_due: 3,
  reminder_3_days_after_due: 1,
  auto_overdue_enabled: true,
  notify_email: true,
  notify_in_app: true,
};
