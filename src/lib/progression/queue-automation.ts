export function computeQueueFlags(input: {
  sla_due_at: string | null;
  status: string | null;
  assigned_staff_id: string | null;
  open_reports: number;
  now_iso: string;
}) {
  const isOverdue = Boolean(
    input.sla_due_at &&
    input.sla_due_at < input.now_iso &&
    (input.status ?? 'open') !== 'closed',
  );
  const isUnassigned = !input.assigned_staff_id;
  const needsEscalation = input.open_reports >= 2 || isOverdue;
  return { isOverdue, isUnassigned, needsEscalation };
}

export function shouldCreateAutoEscalation(input: {
  needs_escalation: boolean;
  open_reports: number;
}) {
  return input.needs_escalation && input.open_reports >= 2;
}
