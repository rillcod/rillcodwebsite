/**
 * Safe public DTOs for progress report cards (result-check / verify).
 * Keep display fields ModernReportCard needs; never leak tenancy secrets or sibling codes.
 */

const PUBLIC_REPORT_KEYS = [
  'id',
  'student_name',
  'gender',
  'school_name',
  'course_name',
  'section_class',
  'student_grade',
  'report_term',
  'report_date',
  'report_period',
  'theory_score',
  'practical_score',
  'attendance_score',
  'participation_score',
  'overall_score',
  'overall_grade',
  'photo_url',
  'key_strengths',
  'areas_for_growth',
  'has_certificate',
  'certificate_text',
  'instructor_name',
  'participation_grade',
  'projects_grade',
  'homework_grade',
  'current_module',
  'next_module',
  'learning_milestones',
  'course_duration',
  'is_published',
  'school_section',
  'fee_label',
  'fee_amount',
  'fee_status',
  'show_payment_notice',
  'engagement_metrics',
  'template_id',
  'published_at',
  'updated_at',
  'verification_code', // needed for QR on the opened card (caller already knows this code path)
] as const;

export type PublicProgressReport = Partial<Record<(typeof PUBLIC_REPORT_KEYS)[number], unknown>> & {
  id?: string;
};

/** Map a DB progress-report row to the public card payload. */
export function toPublicProgressReport(row: Record<string, unknown> | null | undefined): PublicProgressReport | null {
  if (!row || typeof row !== 'object') return null;
  const out: PublicProgressReport = {};
  for (const key of PUBLIC_REPORT_KEYS) {
    if (key in row) (out as Record<string, unknown>)[key] = row[key];
  }
  return out;
}

export function toPublicProgressReportList(
  rows: Array<Record<string, unknown>> | null | undefined,
): PublicProgressReport[] {
  return (rows ?? []).map((row) => toPublicProgressReport(row)).filter(Boolean) as PublicProgressReport[];
}
