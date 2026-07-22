/** Structured audit/observability events (audit §31). */

export type AuditEventName =
  | 'report.preflight.start'
  | 'report.preflight.complete'
  | 'report.preflight.failed'
  | 'report.create'
  | 'report.reuse'
  | 'report.publish'
  | 'report.withdraw'
  | 'report.regenerate'
  | 'report.conflict'
  | 'office.duty.handover'
  | 'curriculum.detect'
  | 'curriculum.override'
  | 'billing.exclude'
  | 'report.comment'
  | 'report.readiness.notify'
  | 'report.email';

export function logAuditEvent(
  name: AuditEventName,
  detail: Record<string, unknown> = {},
): void {
  const payload = {
    event: name,
    at: new Date().toISOString(),
    ...detail,
  };
  if (process.env.NODE_ENV === 'production') {
    console.info('[audit]', JSON.stringify(payload));
  } else {
    console.info('[audit]', payload);
  }
}
