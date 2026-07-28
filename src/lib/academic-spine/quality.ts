export type AcademicEvidenceSummary = {
  evidenceCount: number;
  officiallyLinkedCount: number;
  plannedDeliveryCount: number;
  deliveredCount: number;
  hasOfficialDirection: boolean;
};

export type AcademicQualityStatus = 'ready' | 'needs_attention' | 'blocked';

export function evaluateAcademicEvidence(summary: AcademicEvidenceSummary) {
  const issues: { code: string; message: string }[] = [];
  let status: AcademicQualityStatus = 'ready';

  if (!summary.hasOfficialDirection) {
    issues.push({
      code: 'missing_official_direction',
      message: 'Attach the result to the official curriculum edition used by this class.',
    });
    status = 'blocked';
  }
  if (summary.evidenceCount === 0) {
    issues.push({
      code: 'no_assessment_evidence',
      message: 'Add at least one graded piece of learner evidence for this course and term.',
    });
    status = 'blocked';
  } else if (summary.officiallyLinkedCount === 0) {
    issues.push({
      code: 'unlinked_evidence',
      message: 'The marks exist, but they are not connected to the official teaching plan.',
    });
    if (status !== 'blocked') status = 'needs_attention';
  } else if (summary.officiallyLinkedCount < summary.evidenceCount) {
    issues.push({
      code: 'partly_linked_evidence',
      message: 'Some marks still need to be connected to the official teaching plan.',
    });
    if (status !== 'blocked') status = 'needs_attention';
  }

  const curriculumCoverage = summary.evidenceCount
    ? Math.round((summary.officiallyLinkedCount / summary.evidenceCount) * 10_000) / 100
    : 0;
  const teachingDelivery = summary.plannedDeliveryCount
    ? Math.round((summary.deliveredCount / summary.plannedDeliveryCount) * 10_000) / 100
    : null;

  return { status, issues, curriculumCoverage, teachingDelivery };
}

export function humanAcademicStatus(status: string) {
  if (status === 'ready') return 'Ready to publish';
  if (status === 'needs_attention') return 'Needs a quick review';
  if (status === 'blocked') return 'Not ready yet';
  return 'Not checked yet';
}
