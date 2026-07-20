export type OperationsRole = 'admin' | 'teacher';

export interface DutyCandidate {
  id: string;
  fullName: string;
  role: OperationsRole;
  canHandleAdmin?: boolean;
  schoolId: string | null;
  additionalSchoolIds?: string[];
  isActive: boolean;
  isDeleted?: boolean;
  acceptsGeneralQueue: boolean;
  isAvailable: boolean;
  unavailableUntil?: string | null;
  maxActiveCases: number;
  activeCases: number;
  skillTags: string[];
  isPrimaryDuty: boolean;
  isBackupDuty: boolean;
  teachesWithinMinutes?: number | null;
}

export interface DutyRoutingContext {
  now: string;
  targetSchoolId?: string | null;
  classOwnerId?: string | null;
  requiredSkill?: string | null;
  restrictedToAdmin?: boolean;
}

export interface RankedDutyCandidate extends DutyCandidate {
  score: number;
  reasons: string[];
  atCapacity: boolean;
}

function isInSchoolScope(
  candidate: DutyCandidate,
  targetSchoolId?: string | null,
  restrictedToAdmin?: boolean,
): boolean {
  if (!targetSchoolId || candidate.role === 'admin' || (restrictedToAdmin && candidate.canHandleAdmin)) return true;
  if (candidate.schoolId === targetSchoolId) return true;
  return (candidate.additionalSchoolIds ?? []).includes(targetSchoolId);
}

export function rankDutyCandidates(
  candidates: DutyCandidate[],
  context: DutyRoutingContext,
): RankedDutyCandidate[] {
  const nowMs = new Date(context.now).getTime();

  return candidates
    .filter((candidate) => {
      if (!candidate.isActive || candidate.isDeleted) return false;
      if (!candidate.acceptsGeneralQueue || !candidate.isAvailable) return false;
      if (context.restrictedToAdmin && candidate.role !== 'admin' && !candidate.canHandleAdmin) return false;
      if (!isInSchoolScope(candidate, context.targetSchoolId, context.restrictedToAdmin)) return false;
      if (candidate.unavailableUntil && new Date(candidate.unavailableUntil).getTime() > nowMs) return false;
      return true;
    })
    .map((candidate) => {
      const reasons: string[] = [];
      const atCapacity = candidate.activeCases >= candidate.maxActiveCases;
      let score = 0;

      if (context.restrictedToAdmin && (candidate.role === 'admin' || candidate.canHandleAdmin)) {
        score += 200;
        reasons.push('restricted administrator work');
      } else if (candidate.role === 'admin') {
        score -= 60;
        reasons.push('admin protected for exceptions');
      }

      if (context.classOwnerId === candidate.id) {
        score += 100;
        reasons.push('owns the customer class');
      }
      if (context.requiredSkill && candidate.skillTags.includes(context.requiredSkill)) {
        score += 60;
        reasons.push(`skill match: ${context.requiredSkill}`);
      }
      if (candidate.isPrimaryDuty) {
        score += 40;
        reasons.push('current primary duty');
      } else if (candidate.isBackupDuty) {
        score += 20;
        reasons.push('current backup duty');
      }
      if (typeof candidate.teachesWithinMinutes === 'number' && candidate.teachesWithinMinutes <= 60) {
        score -= 25;
        reasons.push('teaching within 60 minutes');
      }
      score -= candidate.activeCases * 10;
      if (candidate.activeCases > 0) reasons.push(`${candidate.activeCases} active case(s)`);
      if (atCapacity) {
        score -= 50;
        reasons.push('at configured capacity');
      }

      return { ...candidate, score, reasons, atCapacity };
    })
    .sort((a, b) =>
      (b.score - a.score)
      || (a.activeCases - b.activeCases)
      || a.fullName.localeCompare(b.fullName)
      || a.id.localeCompare(b.id),
    );
}

export function chooseDutyAssignee(
  candidates: DutyCandidate[],
  context: DutyRoutingContext,
): RankedDutyCandidate | null {
  return rankDutyCandidates(candidates, context)[0] ?? null;
}
