export type CurriculumQualityIssue = {
  level: 'error' | 'warning';
  location: string;
  message: string;
};

type Week = { week?: unknown; topic?: unknown; subtopics?: unknown };
type Term = { year?: unknown; term?: unknown; weeks?: unknown };

function positiveInteger(value: unknown, fallback?: number): number | null {
  const candidate = value == null ? fallback : Number(value);
  return Number.isInteger(candidate) && Number(candidate) > 0 ? Number(candidate) : null;
}

/**
 * Fast client/server preview of the database publication gate. The database is
 * still authoritative; this lets an administrator correct gaps before pressing
 * “Publish official academic direction”.
 */
export function inspectCurriculumQuality(content: unknown): {
  passed: boolean;
  errors: CurriculumQualityIssue[];
  warnings: CurriculumQualityIssue[];
  termCount: number;
  weekCount: number;
} {
  const issues: CurriculumQualityIssue[] = [];
  const document = content && typeof content === 'object' && !Array.isArray(content)
    ? content as Record<string, unknown>
    : {};
  const terms = Array.isArray(document.terms) ? document.terms as Term[] : [];
  if (terms.length === 0) {
    issues.push({ level: 'error', location: 'Curriculum', message: 'Add at least one curriculum term.' });
  }
  const seen = new Set<string>();
  let weekCount = 0;

  for (const term of terms) {
    const year = positiveInteger(term.year, 1);
    const termNumber = positiveInteger(term.term);
    const location = year && termNumber ? `Programme Year ${year}, Term ${termNumber}` : 'Curriculum term';
    if (!termNumber) {
      issues.push({ level: 'error', location, message: 'Choose a valid term position.' });
      continue;
    }
    const weeks = Array.isArray(term.weeks) ? term.weeks as Week[] : [];
    if (weeks.length === 0) {
      issues.push({ level: 'error', location, message: 'Add at least one teaching week.' });
      continue;
    }
    for (const week of weeks) {
      weekCount += 1;
      const weekNumber = positiveInteger(week.week);
      const weekLocation = weekNumber ? `${location}, Week ${weekNumber}` : location;
      if (!weekNumber) {
        issues.push({ level: 'error', location: weekLocation, message: 'Choose a valid week number.' });
        continue;
      }
      const key = `${year}:${termNumber}:${weekNumber}`;
      if (seen.has(key)) {
        issues.push({ level: 'error', location: weekLocation, message: 'This week position is duplicated.' });
      }
      seen.add(key);
      if (typeof week.topic !== 'string' || !week.topic.trim()) {
        issues.push({ level: 'error', location: weekLocation, message: 'Add a clear teaching topic.' });
      }
      if (!Array.isArray(week.subtopics) || week.subtopics.length === 0) {
        issues.push({ level: 'warning', location: weekLocation, message: 'Add supporting focus points for the teacher.' });
      }
    }
  }
  if (typeof document.overview !== 'string' || !document.overview.trim()) {
    issues.push({ level: 'warning', location: 'Curriculum', message: 'Add a short teacher-friendly overview.' });
  }
  const errors = issues.filter((issue) => issue.level === 'error');
  return {
    passed: errors.length === 0,
    errors,
    warnings: issues.filter((issue) => issue.level === 'warning'),
    termCount: terms.length,
    weekCount,
  };
}

