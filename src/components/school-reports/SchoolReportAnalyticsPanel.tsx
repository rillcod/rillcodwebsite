'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DonutChart, HorizontalBarChart, VerticalBarChart } from '@/components/charts';
import { DocumentArrowDownIcon } from '@/lib/icons';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';
import { mergeProgrammeCoursePerformanceWithEnrolment } from '@/lib/school-reports/programme-course-performance';
import { formatClassDisplay, formatProgrammeCourseDisplay } from '@/lib/school-reports/display-labels';
import { money, pct, plainStatus } from '@/lib/school-reports/ui/constants';
import { REPORT_ANALYTICS_COLORS } from '@/lib/school-reports/design';
import { SchoolReportKpi } from '@/components/school-reports/SchoolReportKpi';
import { downloadSchoolReportRosterPdf } from '@/lib/rosters/download-school-report-roster';

const LEARNER_PAGE_SIZE = 25;

export function SchoolReportAnalyticsPanel({
  report,
  role = 'teacher',
}: {
  report: SchoolPerformanceReportRow;
  role?: string;
}) {
  const [learnerPage, setLearnerPage] = useState(1);
  const [rosterWorking, setRosterWorking] = useState(false);
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const s = report.snapshot;
  const programmeCourseRows = mergeProgrammeCoursePerformanceWithEnrolment(
    s.programmeCoursePerformance || [],
    s.schoolProgrammes || [],
  );
  const maxChartRows = s.reportPolicy?.display.maxChartRows || 12;
  const learners = Array.isArray(s.learners) ? s.learners : [];
  const needsSupport = learners.filter(
    (row) => row.status === 'Needs support' || row.status === 'Attendance risk',
  ).length;
  const learnerPages = Math.max(1, Math.ceil(learners.length / LEARNER_PAGE_SIZE));
  const pagedLearners = useMemo(() => {
    const start = (learnerPage - 1) * LEARNER_PAGE_SIZE;
    return learners.slice(start, start + LEARNER_PAGE_SIZE);
  }, [learnerPage, learners]);
  const sourceSummary = s.dataSources?.length
    ? `${s.dataSources.filter((row) => row.status === 'ok').length}/${s.dataSources.length} sources OK`
    : 'Source ledger unavailable';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-muted-foreground">Analytics canvas</p>
          <p className="text-[11px] text-muted-foreground">
            Snapshot {s.generatedAt ? new Date(s.generatedAt).toLocaleString() : 'unknown'} · {sourceSummary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role !== 'school' ? (
            <button
              type="button"
              disabled={rosterWorking}
              onClick={async () => {
                setRosterWorking(true);
                setRosterNote(null);
                try {
                  const result = await downloadSchoolReportRosterPdf(report.id, {
                    title: `RC Roster — ${report.title}`,
                    splitByClass: true,
                  });
                  setRosterNote(result.message ?? (result.ok ? 'Roster PDF ready.' : 'Could not print roster.'));
                } finally {
                  setRosterWorking(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/20 px-4 py-2 text-sm font-black text-emerald-700 dark:text-emerald-300 disabled:opacity-50 transition-colors"
            >
              {rosterWorking ? 'Building roster…' : 'Print RC Roster'}
            </button>
          ) : null}
          <Link
            href={`/dashboard/card-studio?tab=manage&type=student&view=roster&school=${encodeURIComponent(report.school_id)}`}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground px-4 py-2 text-sm font-black transition-colors shadow-sm"
          >
            Card Studio roster
          </Link>
          <a
            href={`/api/school-performance-reports/${report.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            Open PDF book
          </a>
        </div>
      </div>
      {rosterNote ? (
        <p className="text-xs font-bold text-muted-foreground">{rosterNote}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SchoolReportKpi label="Active learners" value={s.summary.activeStudents} note={`${s.summary.studentsWithScores} with scores`} color={REPORT_ANALYTICS_COLORS.learners} />
        {typeof s.summary.participantsInClasses === 'number' ? (
          <SchoolReportKpi
            label="In classes"
            value={s.summary.participantsInClasses}
            note={
              s.summary.unassignedLearners
                ? `${s.summary.unassignedLearners} unassigned`
                : 'Matches roster total'
            }
            color={REPORT_ANALYTICS_COLORS.classes}
          />
        ) : null}
        <SchoolReportKpi label="Assigned staff" value={s.summary.activeStaff} note={`${s.summary.activeTeachers} teachers at this school only`} color={REPORT_ANALYTICS_COLORS.staff} />
        <SchoolReportKpi label="Average score" value={pct(s.summary.averageScore)} note={`${s.summary.submissionsReceived} submissions`} color={REPORT_ANALYTICS_COLORS.score} />
        <SchoolReportKpi label="Attendance" value={pct(s.summary.attendanceRate)} note="Attendance register prioritised" color={REPORT_ANALYTICS_COLORS.attendance} />
        <SchoolReportKpi label="Curriculum coverage" value={pct(s.summary.curriculumCoverage)} note={`${s.curriculum.completedWeeks}/${s.curriculum.plannedWeeks} weeks`} color={REPORT_ANALYTICS_COLORS.curriculum} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-black">Score distribution</h3>
          <DonutChart
            data={s.scoreBands.map((b) => ({ label: b.label, value: b.count, color: b.color }))}
            centerLabel="Average"
            centerValue={pct(s.summary.averageScore)}
            height={250}
          />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-black">Attendance distribution</h3>
          <DonutChart
            data={s.attendanceBands.map((b) => ({ label: b.label, value: b.count, color: b.color }))}
            centerLabel="Attendance"
            centerValue={pct(s.summary.attendanceRate)}
            height={250}
          />
        </section>
      </div>

      {s.classPerformance.length ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-black">Class performance</h3>
          <div className="mt-5 h-[280px]">
            <VerticalBarChart
              data={s.classPerformance.slice(0, maxChartRows).map((row) => ({
                name: formatClassDisplay(row.className),
                score: row.averageScore,
              }))}
              xKey="name"
              bars={[{ key: 'score', label: 'Avg score', color: REPORT_ANALYTICS_COLORS.curriculum }]}
              height={320}
              formatValue={(value) => `${value}%`}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Class</th>
                  <th className="p-3">Teacher</th>
                  <th className="p-3">Learners</th>
                  <th className="p-3">Avg</th>
                  <th className="p-3">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {s.classPerformance.map((row, index) => (
                  <tr key={`${row.classId || row.className}-${index}`} className="border-b border-border/60">
                    <td className="p-3 font-bold">{row.className}</td>
                    <td className="p-3 text-muted-foreground">{row.teacherName || '—'}</td>
                    <td className="p-3">{row.students}</td>
                    <td className="p-3 font-black text-primary">{pct(row.averageScore)}</td>
                    <td className="p-3">{pct(row.attendanceRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {role !== 'school' && learners.length ? (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-black">Learner roster</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {learners.length} active learners · {needsSupport} flagged · staff view only.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Learner</th>
                <th className="p-3">Grade</th>
                <th className="p-3">Class</th>
                <th className="p-3">Score</th>
                <th className="p-3">Attendance</th>
                <th className="p-3">Status</th>
                <th className="p-3">Next step</th>
              </tr>
            </thead>
            <tbody>
              {pagedLearners.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="p-3 font-bold">{row.name}</td>
                  <td className="p-3 font-bold">{row.gradeLabel || '—'}</td>
                  <td className="p-3">{row.classLabel || row.className}</td>
                  <td className="p-3">{row.averageScore == null ? '—' : pct(row.averageScore)}</td>
                  <td className="p-3">{row.attendanceRate == null ? '—' : pct(row.attendanceRate)}</td>
                  <td
                    className={`p-3 font-bold ${
                      row.status === 'Needs support' || row.status === 'Attendance risk'
                        ? 'text-rose-600'
                        : row.status === 'Excellent'
                          ? 'text-emerald-600'
                          : ''
                    }`}
                  >
                    {row.status}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{row.nextStep || '—'}</td>
                </tr>
              ))}
              {!pagedLearners.length ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    No learners on this page.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {learners.length > LEARNER_PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {learnerPage} of {learnerPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={learnerPage <= 1}
                onClick={() => setLearnerPage((p) => p - 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs font-black disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={learnerPage >= learnerPages}
                onClick={() => setLearnerPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs font-black disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-black">School invoice for this term</h3>
          <Link href={s.finance.billingHref} className="text-xs font-black text-primary underline-offset-2 hover:underline">
            {s.finance.attached ? 'Open in Finance Center' : 'Create invoice in Finance Center'}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SchoolReportKpi label="Invoiced" value={money(s.finance.totalInvoiced, s.finance.currency)} note={`${s.finance.invoiceCount} matching`} color={REPORT_ANALYTICS_COLORS.learners} />
          <SchoolReportKpi label="Paid" value={money(s.finance.totalPaid, s.finance.currency)} note="Recorded payments" color={REPORT_ANALYTICS_COLORS.score} />
          <SchoolReportKpi label="Outstanding" value={money(s.finance.totalOutstanding, s.finance.currency)} note="Balance still due" color="hsl(var(--destructive))" />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Invoice</th>
                <th className="p-3">Status</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Paid</th>
                <th className="p-3">Balance</th>
                <th className="p-3">Document</th>
              </tr>
            </thead>
            <tbody>
              {s.finance.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border/60">
                  <td className="p-3 font-bold">{invoice.invoiceNumber}</td>
                  <td className="p-3">{plainStatus(invoice.status)}</td>
                  <td className="p-3">{money(invoice.amount, s.finance.currency)}</td>
                  <td className="p-3">{money(invoice.paid, s.finance.currency)}</td>
                  <td className="p-3">{money(invoice.outstanding, s.finance.currency)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-3">
                      {invoice.editHref ? (
                        <Link className="font-black text-primary underline" href={invoice.editHref}>
                          Edit
                        </Link>
                      ) : null}
                      <a className="font-black text-primary underline" href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
                        PDF
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.finance.invoices.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No invoice matched this academic term and year.</p>
          ) : null}
        </div>
      </section>

      {programmeCourseRows.length ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-black">Programme and course results</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Enrolled = learners in classes for that programme. Evidenced = learners with term scores.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Programme · Course</th>
                  <th className="p-3">Enrolled</th>
                  <th className="p-3">Evidenced</th>
                  <th className="p-3">Avg</th>
                </tr>
              </thead>
              <tbody>
                {programmeCourseRows.slice(0, 15).map((row) => (
                  <tr key={`${row.programme}-${row.course}`} className="border-b border-border/60">
                    <td className="p-3 font-bold">
                      {formatProgrammeCourseDisplay(row.programme, row.course)}
                    </td>
                    <td className="p-3">{row.enrolledStudents ?? '—'}</td>
                    <td className="p-3">{row.students}</td>
                    <td className="p-3 font-black text-primary">{row.submissions > 0 ? pct(row.averageScore) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5">
            <HorizontalBarChart
              data={programmeCourseRows.slice(0, 15).map((row) => ({
                label: formatProgrammeCourseDisplay(row.programme, row.course),
                value: row.averageScore,
                color: row.averageScore >= 75 ? REPORT_ANALYTICS_COLORS.score : row.averageScore >= 50 ? '#d97706' : 'hsl(var(--destructive))',
              }))}
              formatValue={(value) => `${value}%`}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
