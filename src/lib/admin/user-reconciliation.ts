export type OrphanPurgeDecision = {
  allowed: boolean;
  reason: string | null;
};

/**
 * Bulk reconciliation is intentionally narrower than deliberate single-user
 * deletion. It may remove only unused learner rows; staff, school, parent, and
 * academically evidenced accounts need a person to choose reassignment or
 * archival explicitly.
 */
export function decideAutomaticOrphanPurge(
  role: string | null | undefined,
  protectedEvidenceTotal: number,
): OrphanPurgeDecision {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  if (protectedEvidenceTotal > 0) {
    return {
      allowed: false,
      reason: 'protected academic evidence — archive instead',
    };
  }
  if (normalizedRole !== 'student') {
    return {
      allowed: false,
      reason: `${normalizedRole || 'unknown'} ownership requires manual review`,
    };
  }
  return { allowed: true, reason: null };
}

