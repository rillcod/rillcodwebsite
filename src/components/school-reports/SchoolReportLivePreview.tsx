'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  densityClasses,
  previewDeviceWidth,
  showReportSection,
  type SchoolReportDesignSettings,
  type SchoolReportSectionKey,
} from '@/lib/school-reports/design';
import type { SchoolPerformanceReportRow, SchoolReportNarrative } from '@/lib/school-reports/types';
import { resolveSchoolReportInsights } from '@/lib/school-reports/insights';
import { DeliveryLedgerView } from '@/components/school-reports/DeliveryLedgerView';
import { SegmentGrid, SegmentPanel } from '@/components/school-reports/SegmentPanel';
import { buildTopicsCoveredDraft } from '@/lib/school-reports/delivered-topics';
import { DonutChart, RadialRing, HorizontalBarChart } from '@/components/charts';

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

function PreviewSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <div className="h-1 w-8 rounded-full" style={{ background: accent }} />
        <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground">{title}</h4>
      </div>
      {children}
    </section>
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
    return <p className={`italic text-muted-foreground ${className}`}>{empty}</p>;
  }
  return (
    <ul className={`list-disc space-y-1 pl-4 ${className}`}>
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
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const snapshot = report.snapshot || ({} as SchoolPerformanceReportRow['snapshot']);
  const insights = resolveSchoolReportInsights(snapshot);
  const finance = snapshot.finance;
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const density = densityClasses(design.density);
  const accent = design.accentColor;
  const deviceWidth = previewDeviceWidth(design.previewDevice);
  const show = (key: SchoolReportSectionKey) => showReportSection(design, key);
  const topicsProse =
    narrative.topicsCovered?.trim() ||
    insights?.topicsProseSeed ||
    buildTopicsCoveredDraft(snapshot) ||
    '';
  const showDelivery = show('deliverySummary') || Boolean(topicsProse);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - 8;
      setScale(available >= deviceWidth ? 1 : Math.max(0.45, available / deviceWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deviceWidth]);

  const communityNote = design.reviewDateNote.trim() || insights?.suggestedPartnershipReview || '';
  const communityMessage = insights?.communityMessage || narrative.executiveSummary;

  return (
    <div ref={frameRef} className="w-full overflow-hidden">
      <div
        className="mx-auto origin-top transition-transform duration-200"
        style={{
          width: deviceWidth,
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
      >
        <article
          className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-white text-foreground shadow-xl shadow-black/10 ${density.page}`}
          style={{ maxWidth: deviceWidth }}
        >
          <header
            className={`-mx-4 -mt-4 mb-1 border-b px-4 py-4 ${
              design.headerStyle === 'minimal' ? 'border-border bg-white' : 'border-b-2'
            }`}
            style={
              design.headerStyle === 'minimal'
                ? undefined
                : { borderColor: accent, background: `linear-gradient(180deg, ${accent}08 0%, #fff 100%)` }
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {design.showLogo ? (
                  <p className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: accent }}>
                    Rillcod Technologies
                  </p>
                ) : null}
                <p className="mt-1 text-[9px] font-bold uppercase text-muted-foreground">School Performance Report</p>
                <h1 className={`mt-2 font-black leading-snug ${density.heading}`}>{report.title}</h1>
                <p className="mt-1 text-xs font-bold" style={{ color: accent }}>
                  {snapshot.school?.name || 'Partner school'}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {snapshot.period?.termLabel} · {snapshot.period?.academicYear}
                </p>
              </div>
              <span
                className="shrink-0 rounded px-2 py-1 text-[9px] font-black uppercase text-white"
                style={{ background: report.status === 'published' ? '#059669' : accent }}
              >
                {report.status === 'published' ? 'Published' : draft ? 'Draft preview' : 'Draft'}
              </span>
            </div>
          </header>

          {/* Graphical Key Performance Rings */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-gradient-to-b from-primary/5 to-transparent p-3 text-center">
              <p className="text-[9px] font-black uppercase text-muted-foreground">Active Learners</p>
              <p className="mt-1 text-2xl font-black text-foreground">{snapshot.summary?.activeStudents ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{snapshot.summary?.studentsWithScores ?? 0} with scores</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-gradient-to-b from-emerald-500/5 to-transparent p-3 text-center">
              <RadialRing
                value={Number(snapshot.summary?.averageScore || 0)}
                size={64}
                strokeWidth={7}
                color="#059669"
                label={pct(snapshot.summary?.averageScore)}
              />
              <p className="mt-1 text-[9px] font-black uppercase text-muted-foreground">Average Score</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-gradient-to-b from-teal-500/5 to-transparent p-3 text-center">
              <RadialRing
                value={Number(snapshot.summary?.attendanceRate || 0)}
                size={64}
                strokeWidth={7}
                color="#0f766e"
                label={pct(snapshot.summary?.attendanceRate)}
              />
              <p className="mt-1 text-[9px] font-black uppercase text-muted-foreground">Attendance</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-gradient-to-b from-primary/5 to-transparent p-3 text-center">
              <RadialRing
                value={Number(snapshot.summary?.curriculumCoverage || 0)}
                size={64}
                strokeWidth={7}
                color={accent}
                label={pct(snapshot.summary?.curriculumCoverage)}
              />
              <p className="mt-1 text-[9px] font-black uppercase text-muted-foreground">Curriculum</p>
            </div>
          </div>

          <PreviewSection title="Executive summary" accent={accent}>
            <p className={`${density.text} leading-relaxed`}>
              {narrative.executiveSummary || 'Write or generate the executive summary in the Write tab…'}
            </p>
          </PreviewSection>

          {showDelivery && insights?.deliveryLedger ? (
            <PreviewSection title="Delivery this term" accent={accent}>
              <DeliveryLedgerView
                ledger={{
                  ...insights.deliveryLedger,
                  nextLines: narrative.nextPeriodFocus?.length
                    ? narrative.nextPeriodFocus.slice(0, 4)
                    : insights.deliveryLedger.nextLines,
                }}
                narrativeProse={topicsProse || undefined}
                variant="full"
                accent={accent}
              />
            </PreviewSection>
          ) : null}

          {show('finance') && finance ? (
            <div
              className={`rounded-xl border px-3 py-2 ${density.text} ${
                finance.attached
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900'
                  : 'border-rose-500/30 bg-rose-500/5 text-rose-900'
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
          ) : null}

          {show('boardBriefing') ? (
            <PreviewSection title="Partnership briefing" accent={accent}>
              <SegmentGrid>
                <SegmentPanel title="Strengths & excellence" accent="#059669" tone="emerald" fillHeight>
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

          {show('moduleCoverage') && (insights?.moduleCoverage?.length || 0) > 0 ? (
            <PreviewSection title="Module coverage" accent={accent}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className={`min-w-full ${density.text}`}>
                  <thead className="bg-muted/40 text-[9px] font-black uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Programme</th>
                      <th className="px-2 py-2 text-left">Course</th>
                      <th className="px-2 py-2 text-right">Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(insights?.moduleCoverage || []).map((row, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-2 py-1.5">{row.programme}</td>
                        <td className="px-2 py-1.5">{row.course}</td>
                        <td className="px-2 py-1.5 text-right">{row.coverage}%</td>
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
            <PreviewSection title="Learner excellence & highlights" accent="#059669">
              <SegmentGrid>
                {(insights?.celebrationWall || []).length ? (
                  <SegmentPanel title="Celebration wall" accent={accent} tone="brand" fillHeight>
                    <ul className={`space-y-2 ${density.text} text-muted-foreground`}>
                      {(insights?.celebrationWall || []).slice(0, 5).map((row, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-black" style={{ color: accent }}>
                            ★
                          </span>
                          <span>
                            <span className="font-bold text-foreground">{row.name}</span> ({row.className}) —{' '}
                            {row.highlight}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </SegmentPanel>
                ) : null}
                {(insights?.learnerHighlights || []).length ? (
                  <SegmentPanel title="Academic highlights" accent="#059669" tone="emerald" fillHeight>
                    <BulletList
                      items={insights?.learnerHighlights || []}
                      empty="Add Manual Result Entry strengths to populate highlights."
                      className={`${density.text} text-muted-foreground`}
                    />
                  </SegmentPanel>
                ) : null}
              </SegmentGrid>
            </PreviewSection>
          ) : null}

          {show('communityMessage') ? (
            <PreviewSection title="Community message" accent={accent}>
              <p className={`${density.text} leading-relaxed`}>{communityMessage}</p>
              {communityNote ? <p className={`mt-2 italic text-muted-foreground ${density.text}`}>{communityNote}</p> : null}
            </PreviewSection>
          ) : null}

          {show('learnerRoster') && learners.length ? (
            <PreviewSection title="Learner roster" accent={accent}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className={`min-w-full ${density.text}`}>
                  <tbody>
                    {learners.slice(0, design.previewDevice === 'mobile' ? 5 : 10).map((row) => (
                      <tr key={row.id} className="border-t border-border/60 first:border-t-0">
                        <td className="px-2 py-1.5 font-medium">{row.name}</td>
                        <td className="px-2 py-1.5 text-right">{pct(row.averageScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PreviewSection>
          ) : null}

          {show('nextPhase') && (insights?.nextPhaseSchool?.length || 0) > 0 ? (
            <PreviewSection title="Next phase" accent={accent}>
              <div className={density.section}>
                {(insights?.nextPhaseSchool || []).slice(0, 3).map((phase) => (
                  <div key={phase.phase} className="rounded-lg border border-border/70 bg-muted/10 p-2">
                    <p className="text-xs font-black">{phase.phase}</p>
                    <BulletList items={phase.actions.slice(0, 3)} className={`mt-1 ${density.text}`} />
                  </div>
                ))}
              </div>
            </PreviewSection>
          ) : null}

          <footer className={`border-t border-border pt-3 ${density.text} text-muted-foreground`}>
            <p>
              {design.previewDevice} preview · {draft ? 'unsaved edits included' : 'saved'}
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
