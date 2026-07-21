/** Rules for which open cases belong on the Office "needs attention" queue (audit §6.5). */

export type AttentionCaseInput = {
  status: string;
  priority?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  next_action_due_at?: string | null;
  first_response_due_at?: string | null;
  restricted?: boolean | null;
  sensitivity?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type AttentionEvaluation = {
  needsAttention: boolean;
  reason: string;
};

const CLOSED = new Set(['resolved', 'closed']);
const MS_HOUR = 60 * 60 * 1000;

/** Unassigned cases only count after this many hours (ordinary new work stays out of the queue). */
export const UNASSIGNED_ATTENTION_HOURS = 4;

/** SLA warning window before first-response due time. */
export const SLA_NEAR_BREACH_HOURS = 2;

export function evaluateCaseAttention(row: AttentionCaseInput, now = Date.now()): AttentionEvaluation {
  if (CLOSED.has(String(row.status || '').toLowerCase())) {
    return { needsAttention: false, reason: '' };
  }

  const priority = String(row.priority || 'normal').toLowerCase();
  const restricted = row.restricted === true || String(row.sensitivity || '').toLowerCase() === 'restricted';

  if (restricted || priority === 'urgent') {
    return {
      needsAttention: true,
      reason: restricted ? 'Needs careful human handling' : 'Urgent priority',
    };
  }

  if (String(row.status || '').toLowerCase() === 'reopened') {
    return { needsAttention: true, reason: 'Case reopened' };
  }

  if (priority === 'high') {
    return { needsAttention: true, reason: 'High priority case' };
  }

  if (row.first_response_due_at) {
    const due = new Date(row.first_response_due_at).getTime();
    if (Number.isFinite(due)) {
      if (due < now) return { needsAttention: true, reason: 'First response SLA breached' };
      if (due - now <= SLA_NEAR_BREACH_HOURS * MS_HOUR) {
        return { needsAttention: true, reason: 'First response SLA due soon' };
      }
    }
  }

  if (row.next_action_due_at) {
    const due = new Date(row.next_action_due_at).getTime();
    if (Number.isFinite(due) && due < now) {
      return { needsAttention: true, reason: 'Next action is late' };
    }
  }

  if (!row.assigned_to) {
    const openedAt = new Date(row.created_at || row.updated_at || 0).getTime();
    if (Number.isFinite(openedAt) && now - openedAt >= UNASSIGNED_ATTENTION_HOURS * MS_HOUR) {
      return { needsAttention: true, reason: 'Unassigned beyond threshold' };
    }
  }

  return { needsAttention: false, reason: '' };
}

export function buildAttentionReason(row: AttentionCaseInput, evaluation: AttentionEvaluation): string {
  if (evaluation.reason) return evaluation.reason;
  if (!row.assigned_to) return 'Choose a staff member';
  if (row.next_action_due_at && new Date(row.next_action_due_at).getTime() < Date.now()) {
    return 'Next action is late';
  }
  return 'Open work';
}

/** Whether a case belongs on the Office attention queue (audit §6.5). */
export function caseNeedsAttention(row: AttentionCaseInput, now = Date.now()): boolean {
  return evaluateCaseAttention(row, now).needsAttention;
}
