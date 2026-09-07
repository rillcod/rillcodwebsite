export type EvidenceReviewItem = {
  id: string;
  title: string;
  detail: string;
  href: string | null;
};

/** Read-only review. Repairs continue through the existing assessment editors. */
export async function loadEvidenceReview(db: any, scope: (query: any) => any) {
  const [assignments, evidence] = await Promise.all([
    scope(db.from('assignments').select('id,title,lesson_plan_id,curriculum_release_id', { count: 'exact' })
      .or('lesson_plan_id.is.null,curriculum_release_id.is.null').order('id').limit(50)),
    scope(db.from('academic_assessment_evidence')
      .select('id,evidence_type,assessment_id,lesson_plan_id,context_status', { count: 'exact' })
      .or('context_status.eq.legacy_unscoped,lesson_plan_id.is.null,curriculum_release_id.is.null')
      .order('id').limit(50)),
  ]);
  if (assignments.error || evidence.error) throw new Error('Assessment review could not be loaded. Please retry.');

  const items: EvidenceReviewItem[] = (assignments.data ?? []).map((row: any) => ({
    id: `assignment:${row.id}`,
    title: row.title || 'Untitled assignment',
    detail: 'Teaching-plan reference is incomplete. Review whether this is class work or separate practice; missing plan references alone do not establish that scores are unusable.',
    href: `/dashboard/assignments/${row.id}/edit`,
  }));
  const sources = [
    ['assignment_submission', 'assignments', 'assignments'],
    ['cbt_session', 'cbt_exams', 'cbt'],
    ['exam_attempt', 'exams', 'exams'],
  ] as const;
  await Promise.all(sources.map(async ([kind, table, path]) => {
    const rows = (evidence.data ?? []).filter((row: any) => row.evidence_type === kind);
    const ids = [...new Set(rows.map((row: any) => row.assessment_id).filter(Boolean))];
    if (!rows.length) return;
    const result = ids.length
      ? await scope(db.from(table).select('id,title').in('id', ids))
      : { data: [], error: null };
    if (result.error) throw new Error('Assessment sources could not be checked. Please retry.');
    for (const sourceId of [...new Set(rows.map((row: any) => row.assessment_id))]) {
      const related = rows.filter((row: any) => row.assessment_id === sourceId);
      const source = result.data?.find((row: any) => row.id === sourceId);
      // One action per assessment, even when several students have marks to review.
      const key = kind === 'assignment_submission' ? `assignment:${sourceId}` : `${kind}:${sourceId ?? related[0].id}`;
      const existing = items.find(item => item.id === key);
      const detail = source
        ? `${related.length} saved mark(s) need their reporting or teaching references checked. Open the assessment to review its result use. Scores remain saved.`
        : `${related.length} saved mark(s) have no accessible source assessment. An administrator must investigate the original record before reconnecting them. Scores remain saved.`;
      if (existing) existing.detail = detail;
      else items.push({ id: key, title: source?.title || 'Saved marks requiring investigation', detail,
        href: source ? `/dashboard/${path}/${source.id}/edit` : null });
    }
  }));
  const other = (evidence.data ?? []).filter((row: any) => !sources.some(([kind]) => kind === row.evidence_type));
  if (other.length) items.push({ id: 'other-evidence', title: 'Other saved marks',
    detail: `${other.length} record(s) need an administrator to confirm their teaching and reporting references.`, href: null });
  return { items: items.sort((a, b) => a.id.localeCompare(b.id)),
    truncated: (assignments.count ?? 0) > 50 || (evidence.count ?? 0) > 50 };
}
