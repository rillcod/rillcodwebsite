export const SETTLEMENT_STATUSES = ['pending', 'processing', 'paid', 'void'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

const TRANSITIONS: Record<SettlementStatus, readonly SettlementStatus[]> = {
  pending: ['processing', 'paid', 'void'],
  processing: ['pending', 'paid', 'void'],
  paid: ['void'],
  void: [],
};

export function canTransitionSettlement(from: unknown, to: unknown): boolean {
  const current = String(from || '').toLowerCase() as SettlementStatus;
  const next = String(to || '').toLowerCase() as SettlementStatus;
  return current === next || (SETTLEMENT_STATUSES as readonly string[]).includes(current) && TRANSITIONS[current].includes(next);
}

export function validateSettlementAmount(amount: unknown): number | null {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 ? value : null;
}