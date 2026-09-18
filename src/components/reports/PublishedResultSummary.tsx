type PublishedResult = {
  is_published?: boolean | null;
  overall_grade?: string | null;
  overall_score?: number | null;
};

/** Show the selected publication's saved result, independent of preview layout. */
export function PublishedResultSummary({ report }: { report: PublishedResult }) {
  if (!report.is_published) return null;
  const grade = report.overall_grade?.trim();
  const hasScore = typeof report.overall_score === 'number' && Number.isFinite(report.overall_score);
  return (
    <dl aria-label="Published result" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-foreground print:hidden">
      <div className="flex items-baseline gap-3">
        <dt className="text-sm text-muted-foreground">Published grade</dt>
        <dd className="text-2xl font-bold">{grade || 'Not recorded'}</dd>
      </div>
      {hasScore && (
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-muted-foreground">Score</dt>
          <dd className="text-lg font-semibold tabular-nums">{report.overall_score}%</dd>
        </div>
      )}
    </dl>
  );
}
