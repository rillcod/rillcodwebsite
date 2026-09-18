import Link from 'next/link';
import { isStaleAcademicSession, liveAcademicSession } from '@/lib/reports/academic-period';

export function SchoolReportTermNotice({ schoolId, schoolName, term, year, now = new Date() }: {
  schoolId: string; schoolName: string; term: string; year: string; now?: Date;
}) {
  const current = liveAcademicSession(now);
  const older = isStaleAcademicSession(term, year, current.termLabel, current.periodLabel);
  const results = new URLSearchParams({ school: schoolName, term, year });
  const setup = new URLSearchParams({ schoolId, report_term: current.termLabel, report_period: current.periodLabel });
  return (
    <section aria-label="School report term" className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="font-semibold text-foreground">{schoolName} · {term} {year}</p>
      <p className="text-sm text-muted-foreground">This book includes results for this term only. Publishing student results does not publish the school report book.</p>
      {older && <p className="text-sm text-amber-700 dark:text-amber-300">You are viewing an older term. Results entered for {current.termLabel} {current.periodLabel} belong in a separate book.</p>}
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/results?${results}`} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground">View this term’s student results</Link>
        {older && <Link href={`/dashboard/school-reports/new?${setup}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Open current-term setup</Link>}
      </div>
    </section>
  );
}
