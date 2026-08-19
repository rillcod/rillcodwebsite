'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import {
  densityClasses,
  REPORT_SEMANTIC_COLORS,
  resolveThemeAwareAccent,
  showReportSection,
  type SchoolReportDesignSettings,
  type SchoolReportPreviewDevice,
  type SchoolReportSectionKey,
} from '@/lib/school-reports/design';
import type { SchoolPerformanceReportRow, SchoolReportNarrative } from '@/lib/school-reports/types';
import { resolveSchoolReportInsights } from '@/lib/school-reports/insights';
import { SegmentGrid, SegmentPanel } from '@/components/school-reports/SegmentPanel';
import { buildTopicsCoveredDraft, buildReportTopicsPresentation } from '@/lib/school-reports/delivered-topics';
import { filterNextPhaseItems, NEXT_TERM_FOCUS_LABEL, resolveCommunityMessageForReport } from '@/lib/school-reports/report-content-dedup';
import { resolveLeadershipNarrativeForDisplay } from '@/lib/school-reports/topics-covered-presentation';
import { ExpandedNarrativePreview } from '@/components/school-reports/ExpandedNarrativePreview';
import { WhatWeTaughtPreview } from '@/components/school-reports/WhatWeTaughtPreview';
import { DeliveryLedgerView } from '@/components/school-reports/DeliveryLedgerView';
import { buildOfficialClosingRemark } from '@/lib/school-reports/closing-remark';
import { compareLearnersForRoster } from '@/lib/school-reports/aggregate';
import {
  formatClassDisplay,
  formatPersonDisplayName,
  formatCourseDisplay,
  formatProgrammeCourseDisplay,
  formatProgrammeDisplay,
} from '@/lib/school-reports/display-labels';
import { mergeProgrammeCoursePerformanceWithEnrolment } from '@/lib/school-reports/programme-course-performance';
import { RadialRing, HorizontalBarChart } from '@/components/charts';

const pct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value))
    ? '—'
    : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function previewLayout(device: SchoolReportPreviewDevice) {
  const compact = device === 'mobile';
  return {
    statsGrid: compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4',
    segmentColumns: (compact ? 1 : 2) as 1 | 2,
    ringSize: compact ? 52 : 64,
    rosterLimit: compact ? 6 : 12,
    courseGrid: compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  };
}

function PreviewSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  const themeAccent = resolveThemeAwareAccent(accent);
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="h-1 w-8 shrink-0 rounded-full bg-primary" style={{ background: accent }} />
        <h4 className="text-xs font-black uppercase tracking-[0.14em] text-foreground">{title}</h4>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function AppendixDivider() {
  return (
    <div className="border-t-2 border-dashed border-border/80 pt-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Detachable appendices</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Everything above stays in the main report flow. Appendices below may be printed separately for school records.
      </p>
    </div>
  );
}

function BulletList({
  items,
  empty = 'Nothing recorded yet.',
  className = '',
}: {
  items: string[];
  empty?: string;
  className?: string;
}) {
  if (!items?.length) {
    return <p className={`text-xs italic text-muted-foreground ${className}`}>{empty}</p>;
  }
  return (
    <ul className={`list-disc space-y-1.5 break-words pl-4 ${className}`}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function SchoolReportLivePreview({
  report,
  narrative,
  design,
  billingHref,
  draft = true,
}: {
  report: SchoolPerformanceReportRow;
  narrative: SchoolReportNarrative;
  design: SchoolReportDesignSettings;
  billingHref: string;
  draft?: boolean;
}) {
  const snapshot = report.snapshot || ({} as SchoolPerformanceReportRow['snapshot']);
  const insights = resolveSchoolReportInsights(snapshot);
  const finance = snapshot.finance;
  const learners = Array.isArray(snapshot.learners) ? [...snapshot.learners].sort(compareLearnersForRoster) : [];
  const manualResultCount = learners.filter((row) => row.scoreSource === 'manual_result').length;
  const manualRollCount = learners.filter((row) => row.attendanceSource === 'manual_roll').length;
  const gradebookFallbackCount = learners.filter((row) => row.scoreSource === 'gradebook').length;
  const resultEntryAttendanceCount = learners.filter((row) => row.attendanceSource === 'result_entry').length;
  const learnersWithComponentEvidence = learners.filter(
    (row) =>
      row.gradebook?.fromPublishedReport
      || row.gradebook?.classworkScore != null
      || row.gradebook?.assignmentAverage != null
      || row.gradebook?.assessmentScore != null,
  ).length;
  const programmeCourseRows = mergeProgrammeCoursePerformanceWithEnrolment(
    snapshot.programmeCoursePerformance || [],
    snapshot.schoolProgrammes || [],
  );
  const density = densityClasses(design.density);
  const accent = design.accentColor;
  const themeAccent = resolveThemeAwareAccent(accent);
  const layout = previewLayout(design.previewDevice);
  const show = (key: SchoolReportSectionKey) => showReportSection(design, key);
  const topicsPresentation = buildReportTopicsPresentation(snapshot);
  const topicsDraftFallback = buildTopicsCoveredDraft(snapshot);
  const leadershipNarrative = resolveLeadershipNarrativeForDisplay(
    narrative.topicsCovered,
    topicsPresentation,
    { fallbackDraft: topicsDraftFallback },
  );
  const topicsProse =
    leadershipNarrative ||
    (!topicsPresentation ? (insights?.topicsProseSeed || topicsDraftFallback || '') : '');
  const showExpandedNarrative = Boolean(leadershipNarrative);
  const showDelivery =
    show('deliverySummary') || Boolean(topicsProse) || Boolean(topicsPresentation) || showExpandedNarrative;

  const communityNote = design.reviewDateNote.trim() || insights?.suggestedPartnershipReview || '';
  const communityMessage = resolveCommunityMessageForReport(
    insights?.communityMessage,
    narrative.executiveSummary,
  );
  const filteredNextPhaseSchool = (insights?.nextPhaseSchool || [])
    .map((phase) => ({
      ...phase,
      actions: filterNextPhaseItems(phase.actions, [
        narrative.executiveSummary,
        leadershipNarrative,
        ...(insights?.deliveryLedger?.nextLines || []),
        ...(narrative.nextPeriodFocus || []),
      ]),
    }))
    .filter((phase) => phase.actions.length > 0);
  const showNextPhase =
    show('nextPhase') &&
    (filteredNextPhaseSchool.length > 0 || (insights?.nextPhaseLearners?.length || 0) > 0);
  const closingRemark = buildOfficialClosingRemark(snapshot, narrative);
  const hasAppendix =
    (show('learnerRoster') && learners.length > 0)
    || (show('finance') && finance)
    || (show('appendixGradebook') && learnersWithComponentEvidence > 0)
    || (show('appendixPayment') && finance && finance.totalPaid > 0);

  return (
    <div
      className={`relative mx-auto w-full transition-all ${
        design.previewDevice === 'mobile'
          ? 'max-w-md'
          : design.previewDevice === 'tablet'
            ? 'max-w-2xl'
            : 'max-w-4xl'
      }`}
    >
      <article
        className="rounded-2xl border border-border/80 bg-card text-card-foreground shadow-sm"
      >
        <header
          className={`border-b border-border/80 px-4 py-4 sm:px-5 sm:py-5 ${
            design.headerStyle === 'minimal' ? 'bg-transparent' : 'bg-muted/30'
          }`}
          style={
            design.headerStyle === 'minimal'
              ? undefined
              : {
                  borderColor: accent,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 8%, transparent) 0%, var(--card) 100%)`,
                }
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {design.showLogo ? (
                <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${themeAccent.textClass}`}>
                  Rillcod Technologies
                </p>
              ) : null}
              <p className="mt-1 text-xs font-bold uppercase text-muted-foreground">School Performance Report</p>
              <h1 className={`mt-2 break-words font-black leading-snug ${density.heading} sm:text-base`}>
                {report.title}
              </h1>
              <p className={`mt-1 break-words text-sm font-black ${themeAccent.textClass}`}>
                {snapshot.school?.name || 'Partner school'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {snapshot.period?.termLabel} · {snapshot.period?.academicYear}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-black uppercase shadow-2xs ${
                report.status === 'published'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
              }`}
            >
              {report.status === 'published' ? 'Published' : draft ? 'Draft preview' : 'Draft'}
            </span>
          </div>
        </header>

        <div className={`flex flex-col ${density.page}`}>
          <div className={`grid gap-2.5 sm:gap-3.5 ${layout.statsGrid}`}>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-gradient-to-b from-primary/10 via-card to-card p-3.5 text-center shadow-2xs">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-black mb-1">
                👥
              </span>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Active Learners</p>
              <p className="mt-0.5 text-2xl font-black text-foreground">{snapshot.summary?.activeStudents ?? 0}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">{snapshot.summary?.studentsWithScores ?? 0} with scores</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-gradient-to-b from-emerald-500/10 via-card to-card p-3.5 text-center shadow-2xs">
              <RadialRing
                value={Number(snapshot.summary?.averageScore || 0)}
                size={layout.ringSize}
                strokeWidth={6}
                color={REPORT_SEMANTIC_COLORS.emerald}
                label={pct(snapshot.summary?.averageScore)}
              />
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Average Score</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-gradient-to-b from-teal-500/10 via-card to-card p-3.5 text-center shadow-2xs">
              <RadialRing
                value={Number(snapshot.summary?.attendanceRate || 0)}
                size={layout.ringSize}
                strokeWidth={6}
                color={REPORT_SEMANTIC_COLORS.teal}
                label={pct(snapshot.summary?.attendanceRate)}
              />
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Attendance</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-gradient-to-b from-primary/10 via-card to-card p-3.5 text-center shadow-2xs">
              <RadialRing
                value={Number(snapshot.summary?.curriculumCoverage || 0)}
                size={layout.ringSize}
                strokeWidth={6}
                color={accent}
                label={pct(snapshot.summary?.curriculumCoverage)}
              />
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Curriculum</p>
            </div>
          </div>

          {manualResultCount + manualRollCount + gradebookFallbackCount + resultEntryAttendanceCount > 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Verified evidence used</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-foreground">
                {manualResultCount > 0 ? <span className="rounded-full bg-background px-2.5 py-1">Teacher-entered results: {manualResultCount}</span> : null}
                {manualRollCount > 0 ? <span className="rounded-full bg-background px-2.5 py-1">Attendance roll: {manualRollCount}</span> : null}
                {gradebookFallbackCount > 0 ? <span className="rounded-full bg-background px-2.5 py-1">Gradebook evidence: {gradebookFallbackCount}</span> : null}
                {resultEntryAttendanceCount > 0 ? <span className="rounded-full bg-background px-2.5 py-1">Recorded attendance: {resultEntryAttendanceCount}</span> : null}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Teacher-entered records remain unchanged. The report reads them first and uses connected gradebook evidence only where a result is missing.
              </p>
            </div>
          ) : null}

          <PreviewSection title="Executive summary" accent={accent}>
            <p className={`${density.text} break-words leading-relaxed`}>
              {narrative.executiveSummary || '—'}
            </p>
          </PreviewSection>

          {showDelivery ? (
            <PreviewSection title="Curriculum delivery" accent={accent}>
              {topicsPresentation || topicsProse ? (
                <div className="mb-4">
                  {topicsPresentation ? (
                    <WhatWeTaughtPreview
                      variant="embedded"
                      presentation={topicsPresentation}
                      enrolledCourses={snapshot.schoolProgrammes || []}
                      courseGridClass={layout.courseGrid}
                    />
                  ) : topicsProse ? (
                    <p className={`${density.text} break-words leading-relaxed whitespace-pre-wrap`}>{topicsProse}</p>
                  ) : null}

                  {showExpandedNarrative && topicsPresentation ? (
                    <div className="mt-4">
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                        Report story
                      </p>
                      <ExpandedNarrativePreview variant="embedded" body={leadershipNarrative} />
                    </div>
                  ) : showExpandedNarrative ? (
                    <ExpandedNarrativePreview variant="embedded" className="mt-2" body={leadershipNarrative} />
                  ) : null}
                </div>
              ) : null}

              {insights?.deliveryLedger ? (
                <DeliveryLedgerView
                  ledger={insights.deliveryLedger}
                  variant="full"
                  accent={accent}
                  className={topicsPresentation || topicsProse ? 'mt-1' : ''}
                />
              ) : null}
            </PreviewSection>
          ) : null}

          {show('boardBriefing') ? (
            <PreviewSection title="Partnership briefing" accent={accent}>
              <SegmentGrid columns={layout.segmentColumns}>
                <SegmentPanel title="Strengths & excellence" tone="emerald" fillHeight>
                  <BulletList
                    items={narrative.achievements?.length ? narrative.achievements : insights?.strengths || []}
                    className={density.text}
                  />
                </SegmentPanel>
                <SegmentPanel title="Partnership focus" accent={accent} tone="brand" fillHeight>
                  <BulletList
                    items={narrative.concerns?.length ? narrative.concerns : insights?.partnershipFocus || []}
                    className={density.text}
                  />
                </SegmentPanel>
              </SegmentGrid>
            </PreviewSection>
          ) : null}

          {show('moduleCoverage') &&
          !insights?.deliveryLedger?.topicRows?.length &&
          (insights?.moduleCoverage?.length || 0) > 0 ? (
            <PreviewSection title="Module coverage" accent={accent}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className={`min-w-full ${density.text}`}>
                  <thead className="bg-muted/40 text-[11px] font-black uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Programme</th>
                      <th className="px-3 py-2 text-left">Course</th>
                      <th className="px-3 py-2 text-right">Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(insights?.moduleCoverage || []).map((row, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-2">{formatProgrammeDisplay(row.programme)}</td>
                        <td className="px-3 py-2">{formatCourseDisplay(row.course)}</td>
                        <td className="px-3 py-2 text-right">{row.coverage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PreviewSection>
          ) : null}

          {show('teacherRoster') && (insights?.teacherDelivery?.length || 0) > 0 ? (
            <PreviewSection title="Who delivered for you" accent={accent}>
              <BulletList items={insights?.teacherDelivery || []} className={density.text} />
            </PreviewSection>
          ) : null}

          {show('learnerHighlights') &&
          (insights?.learnerHighlights?.length || insights?.celebrationWall?.length) ? (
            <PreviewSection title="Learner excellence & highlights" accent={REPORT_SEMANTIC_COLORS.emerald}>
              <SegmentGrid columns={layout.segmentColumns}>
                {(insights?.celebrationWall || []).length ? (
                  <SegmentPanel title="Celebration wall" accent={accent} tone="brand" fillHeight>
                    <ul className={`space-y-2 ${density.text} text-muted-foreground`}>
                      {(insights?.celebrationWall || []).slice(0, 5).map((row, i) => (
                        <li key={i} className="flex gap-2 break-words">
                          <span className="shrink-0 font-black" style={{ color: accent }}>
                            ★
                          </span>
                          <span>
                            <span className="font-bold text-foreground">{formatPersonDisplayName(row.name)}</span> ({formatClassDisplay(row.className)}) —{' '}
                            {row.highlight}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </SegmentPanel>
                ) : null}
                {(insights?.learnerHighlights || []).length ? (
                  <SegmentPanel title="Academic highlights" tone="emerald" fillHeight>
                    <BulletList
                      items={insights?.learnerHighlights || []}
                      empty="Add learner strengths to the term assessment record to populate highlights."
                      className={`${density.text} text-muted-foreground`}
                    />
                  </SegmentPanel>
                ) : null}
              </SegmentGrid>
            </PreviewSection>
          ) : null}

          {show('charts') && (snapshot.classPerformance?.length || programmeCourseRows.length) ? (
            <PreviewSection title="Programme and course outcomes" accent={accent}>
              <SegmentGrid columns={layout.segmentColumns}>
                {snapshot.classPerformance?.length ? (
                  <SegmentPanel title="Mean score by class" accent={accent} tone="brand" fillHeight>
                    <HorizontalBarChart
                      data={snapshot.classPerformance.slice(0, 8).map((row) => ({
                        label: formatClassDisplay(row.className),
                        value: row.averageScore,
                      }))}
                      color={accent}
                      formatValue={(value) => `${value}%`}
                    />
                  </SegmentPanel>
                ) : null}
                {programmeCourseRows.length ? (
                  <SegmentPanel title="Mean score by programme and course" tone="emerald" fillHeight>
                    <HorizontalBarChart
                      data={programmeCourseRows.slice(0, 8).map((row) => ({
                        label: formatProgrammeCourseDisplay(row.programme, row.course),
                        value: row.averageScore,
                      }))}
                      color={REPORT_SEMANTIC_COLORS.emerald}
                      formatValue={(value) => `${value}%`}
                    />
                  </SegmentPanel>
                ) : null}
              </SegmentGrid>
            </PreviewSection>
          ) : null}

          {show('communityMessage') && communityMessage ? (
            <PreviewSection title="Community message" accent={accent}>
              <p className={`${density.text} break-words leading-relaxed`}>{communityMessage}</p>
              {communityNote ? (
                <p className={`mt-2 break-words italic text-muted-foreground ${density.text}`}>{communityNote}</p>
              ) : null}
            </PreviewSection>
          ) : null}

          {showNextPhase ? (
            <PreviewSection title="Next phase" accent={accent}>
              <div className={density.section}>
                {filteredNextPhaseSchool.slice(0, 3).map((phase) => (
                  <div key={phase.phase} className="rounded-lg border border-border/70 bg-muted/10 p-3">
                    <p className="text-sm font-black">{phase.phase}</p>
                    <p className="text-xs text-muted-foreground">{phase.horizon}</p>
                    <BulletList items={phase.actions.slice(0, 3)} className={`mt-1 ${density.text}`} />
                  </div>
                ))}
              </div>
            </PreviewSection>
          ) : null}

          <PreviewSection title="Closing remark" accent={accent}>
            <p className={`${density.text} break-words italic leading-relaxed text-foreground`}>{closingRemark}</p>
          </PreviewSection>

          {hasAppendix ? <AppendixDivider /> : null}

          {show('learnerRoster') && learners.length ? (
            <PreviewSection title="Appendix A — Learner roster" accent={accent}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className={`min-w-full ${density.text}`}>
                  <tbody>
                    {learners.slice(0, layout.rosterLimit).map((row) => (
                      <tr key={row.id} className="border-t border-border/60 first:border-t-0">
                        <td className="px-3 py-2 font-medium">{formatPersonDisplayName(row.name)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="block font-black">{pct(row.averageScore)}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {row.scoreSource === 'manual_result' ? 'Teacher result' : row.scoreSource === 'gradebook' ? 'Gradebook' : 'No score'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="block font-black">{pct(row.attendanceRate)}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {row.attendanceSource === 'manual_roll' ? 'Class roll' : row.attendanceSource === 'result_entry' ? 'Result entry' : 'No attendance'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PreviewSection>
          ) : null}

          {show('finance') && finance ? (
            <PreviewSection title="Appendix B — School invoice" accent={accent}>
              <div
                className={`rounded-xl border px-3 py-2.5 ${density.text} ${
                  finance.attached
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/5 text-rose-900 dark:text-rose-200'
                }`}
              >
                {finance.attached ? (
                  <p>
                    <span className="font-black">Invoice attached:</span> {finance.invoiceCount} ·{' '}
                    {money(finance.totalOutstanding, finance.currency)} outstanding
                  </p>
                ) : (
                  <p>
                    <span className="font-black">Invoice missing.</span>{' '}
                    <Link href={billingHref} className="underline">
                      Create in Finance Center
                    </Link>
                  </p>
                )}
              </div>
            </PreviewSection>
          ) : null}

          {show('appendixGradebook') && learnersWithComponentEvidence > 0 ? (
            <PreviewSection title="Appendix C — Classwork, assignments and assessment" accent={accent}>
              <p className={`${density.text} text-muted-foreground`}>
                Published component scores for {learnersWithComponentEvidence}/{learners.length}{' '}
                learners in the published PDF.
              </p>
            </PreviewSection>
          ) : null}

          {show('appendixPayment') && finance && finance.totalPaid > 0 ? (
            <PreviewSection title="Appendix D — Payment confirmation" accent={accent}>
              <p className={`${density.text} text-muted-foreground`}>
                <span className="font-black text-foreground">{money(finance.totalPaid, finance.currency)}</span> recorded
                across {finance.invoices.filter((row) => row.paid > 0).length} invoice(s).
              </p>
            </PreviewSection>
          ) : null}

          <footer className={`border-t border-border pt-3 ${density.text} text-muted-foreground`}>
            <p>
              {design.previewDevice} layout · {draft ? 'unsaved edits included' : 'saved'}
            </p>
          </footer>
        </div>
      </article>
    </div>
  );
}
