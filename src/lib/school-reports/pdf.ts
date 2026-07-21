import fs from 'node:fs';
import path from 'node:path';
import { brandContact, brandContactLine } from '@/config/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeSchoolReportDesign, showReportSection, type SchoolReportSectionKey } from './design';
import { resolveLearnerGradeForDisplay } from './aggregate';
import { resolveSchoolReportInsights } from './insights';
import { buildTopicsCoveredDraft } from './delivered-topics';
import { buildDeliveryLedger, type DeliveryLedger } from './delivery-structure';
import { loadSchoolReportPaymentAccounts, type SchoolReportPaymentAccount } from './payment-accounts';
import { renderPdfToBuffer } from '@/lib/pdfmake-server';
import type { SchoolPerformanceReportRow } from './types';

/** Official school-report letterhead accent (aligned with Rillcod school materials). */
const BRAND = '#7a0606';
const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#d1d5db';
const BORDER = '#e5e7eb';
const HEADER_BG = '#1f2937';
const PAGE_WIDTH_CONTENT = 515;

function cleanDisplayText(value: unknown): string {
  let text = String(value ?? '');
  for (let attempt = 0; attempt < 3 && /[ÃƒÃ‚Ã¢]/.test(text); attempt += 1) {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    const currentNoise = (text.match(/[ÃƒÃ‚Ã¢ï¿½]/g) || []).length;
    const repairedNoise = (repaired.match(/[ÃƒÃ‚Ã¢ï¿½]/g) || []).length;
    if (repairedNoise >= currentNoise) break;
    text = repaired;
  }
  return text.replace(/ï¿½/g, '').trim();
}

type Band = { label: string; count: number; color: string };
type NamedValue = { label: string; value: number; color: string };

function loadPngDataUrl(candidates: string[]): string | null {
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function loadBrandLogoDataUrl(): string | null {
  return loadPngDataUrl([
    path.join(process.cwd(), 'public', 'images', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'logo.png'),
  ]);
}

function loadOfficialSignatureDataUrl(): string | null {
  return loadPngDataUrl([
    path.join(process.cwd(), 'public', 'images', 'signature.png'),
    path.join(process.cwd(), 'public', 'signature.png'),
  ]);
}

const textList = (items: string[], color = INK) =>
  items.length
    ? { ul: items, color, fontSize: 9, lineHeight: 1.35, margin: [0, 2, 0, 6] }
    : { text: 'No items recorded.', color: MUTED, italics: true, fontSize: 8, margin: [0, 2, 0, 6] };

const briefLearnerLine = (value: string) => {
  const text = String(value || '').trim();
  const match = text.match(/^(.+?):\s*(\d+(?:\.\d+)?%)/);
  return match ? `${match[1]}: ${match[2]} term average` : text.slice(0, 120);
};

const briefExecutiveItems = (items: string[], maxItems = 4, maxChars = 140) =>
  items.slice(0, maxItems).map((value) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text;
    return firstSentence.length > maxChars ? `${firstSentence.slice(0, maxChars - 3).trimEnd()}...` : firstSentence;
  });

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const plainStatus = (value: string) =>
  String(value || 'pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const fmtPct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? '-' : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;

/** Open metric cell - no filled cards; keeps the page calm and official. */
function compactMetric(label: string, value: string, note: string, color = BRAND) {
  return {
    stack: [
      { text: label.toUpperCase(), color: MUTED, fontSize: 6.5, bold: true, characterSpacing: 0.8 },
      { text: value, color, fontSize: 14, bold: true, margin: [0, 4, 0, 2] },
      { text: note, color: MUTED, fontSize: 7.5, lineHeight: 1.2 },
    ],
  };
}

function progressBar(label: string, value: number, color: string) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return {
    stack: [
      {
        columns: [
          { text: label, bold: true, fontSize: 8, color: INK },
          { text: `${safe}%`, alignment: 'right', bold: true, color, fontSize: 8 },
        ],
      },
      {
        margin: [0, 3, 0, 2],
        table: {
          widths: [`${safe}%`, `${100 - safe}%`],
          body: [
            [
              { text: '', fillColor: color, margin: [0, 2.5, 0, 2.5], border: [false, false, false, false] },
              { text: '', fillColor: '#e5e7eb', margin: [0, 2.5, 0, 2.5], border: [false, false, false, false] },
            ],
          ],
        },
        layout: 'noBorders',
      },
    ],
  };
}

function tableLayout() {
  return {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? HEADER_BG : rowIndex % 2 ? '#ffffff' : '#f9fafb'),
    hLineColor: () => BORDER,
    vLineColor: () => BORDER,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };
}

function panelBorderLayout(accent = BRAND) {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 ? 2 : i === node.table.body.length ? 1 : 0,
    vLineWidth: () => 1,
    hLineColor: (i: number) => (i === 0 ? accent : BORDER),
    vLineColor: () => BORDER,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

/** Bordered segment panel for PDF - matches UI SegmentPanel with accent top rule. */
function borderedSegment(title: string, body: object[], accent = BRAND) {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [{ text: title.toUpperCase(), style: 'subsection', color: accent, margin: [0, 0, 0, 5] }, ...body],
            margin: [10, 8, 10, 10],
          },
        ],
      ],
    },
    layout: panelBorderLayout(accent),
    margin: [0, 0, 0, 8] as [number, number, number, number],
  };
}

function headerCells(labels: string[]) {
  return labels.map((text) => ({ text, style: 'tableHeader' }));
}

function brandAccentRule() {
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: PAGE_WIDTH_CONTENT, h: 2.5, color: BRAND, lineWidth: 0 },
      { type: 'rect', x: 0, y: 2.5, w: PAGE_WIDTH_CONTENT, h: 0.75, color: RULE, lineWidth: 0 },
    ],
    margin: [0, 0, 0, 10],
  };
}

function borderedPanelLayout(fillColor = '#f9fafb') {
  return {
    fillColor: () => fillColor,
    hLineColor: () => BORDER,
    vLineColor: () => BORDER,
    paddingLeft: () => 10,
    paddingRight: () => 10,
    paddingTop: () => 8,
    paddingBottom: () => 8,
  };
}

function paymentAccountsBlock(accounts: SchoolReportPaymentAccount[]) {
  const providusAccounts = accounts.filter((account) =>
    [account.bankName, account.label].join(' ').toLowerCase().includes('providus'),
  );
  if (!providusAccounts.length) {
    return {
      stack: [
        { text: 'Payment instructions', style: 'subsection' },
        {
          text: `Providus Bank transfer details are unavailable in this snapshot. Please contact the official Rillcod WhatsApp line on 08116600091 and quote your invoice number.`,
          color: MUTED,
          fontSize: 8,
          lineHeight: 1.35,
        },
      ],
      margin: [0, 4, 0, 8] as [number, number, number, number],
    };
  }

  return {
    stack: [
      { text: 'Payment instructions - bank transfer', style: 'subsection' },
      {
        text: 'Quote your invoice number as the payment reference. Use the Providus Bank account below, then send the receipt by WhatsApp to the official line: 08116600091.',
        color: MUTED,
        fontSize: 7.5,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        table: {
          widths: ['*'],
          body: providusAccounts.slice(0, 1).map((acct) => [
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { text: acct.label || 'Rillcod account', fontSize: 8, bold: true, color: BRAND },
                    { text: acct.bankName, fontSize: 7.5, color: MUTED },
                    ...(acct.paymentNote
                      ? [{ text: acct.paymentNote, fontSize: 7, color: MUTED, italics: true, margin: [0, 2, 0, 0] as [number, number, number, number] }]
                      : []),
                  ],
                },
                {
                  width: 'auto',
                  stack: [
                    { text: 'ACCOUNT NUMBER', fontSize: 6.5, bold: true, color: MUTED, alignment: 'right' as const },
                    {
                      text: acct.accountNumber,
                      fontSize: 12,
                      bold: true,
                      alignment: 'right' as const,
                      characterSpacing: 1,
                      margin: [0, 2, 0, 2] as [number, number, number, number],
                    },
                    { text: acct.accountName, fontSize: 7.5, alignment: 'right' as const },
                  ],
                },
              ],
              margin: [10, 8, 10, 8] as [number, number, number, number],
            },
          ]),
        },
        layout: {
          fillColor: () => '#faf5ff',
          hLineColor: () => '#e9d5ff',
          vLineColor: () => '#e9d5ff',
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 6, 0, 8] as [number, number, number, number],
  };
}

/** Compact pie + legend in one column. */
function pieChartBlock(
  title: string,
  bands: Band[],
  opts?: { size?: number; donut?: boolean; emptyLabel?: string },
) {
  const size = opts?.size ?? 96;
  const donut = opts?.donut !== false;
  const total = bands.reduce((sum, band) => sum + Math.max(0, Number(band.count) || 0), 0);
  if (total <= 0) {
    return {
      stack: [
        { text: title, style: 'subsection' },
        {
          text: opts?.emptyLabel || 'No data.',
          color: MUTED,
          italics: true,
          fontSize: 8,
          margin: [0, 4, 0, 0],
        },
      ],
    };
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = donut ? outerR * 0.52 : 0;
  const canvas: Array<Record<string, unknown>> = [];
  let angle = -Math.PI / 2;

  for (const band of bands) {
    const value = Math.max(0, Number(band.count) || 0);
    if (value <= 0) continue;
    const sweep = (value / total) * Math.PI * 2;
    const points: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];
    const steps = Math.max(6, Math.ceil((sweep / (Math.PI * 2)) * 36));
    for (let i = 0; i <= steps; i += 1) {
      const a = angle + (sweep * i) / steps;
      points.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) });
    }
    canvas.push({
      type: 'polyline',
      points,
      color: band.color,
      lineColor: '#ffffff',
      lineWidth: 1,
      closePath: true,
    });
    angle += sweep;
  }

  if (donut && innerR > 0) {
    canvas.push({
      type: 'ellipse',
      x: cx,
      y: cy,
      r1: innerR,
      r2: innerR,
      color: '#ffffff',
      lineWidth: 0,
    });
  }

  const legend = bands
    .filter((band) => Math.max(0, Number(band.count) || 0) > 0)
    .map((band) => {
      const value = Math.max(0, Number(band.count) || 0);
      const pct = Math.round((value / total) * 100);
      return {
        columns: [
          {
            width: 8,
            canvas: [{ type: 'rect', x: 0, y: 1, w: 7, h: 7, color: band.color, lineWidth: 0 }],
          },
          {
            width: '*',
            text: `${band.label}  ${value} (${pct}%)`,
            fontSize: 7,
            color: INK,
            margin: [3, 0, 0, 0],
          },
        ],
        margin: [0, 1, 0, 1],
      };
    });

  return {
    stack: [
      { text: title, style: 'subsection' },
      {
        columns: [
          { width: size, canvas },
          { width: '*', stack: legend, margin: [8, 6, 0, 0] },
        ],
        columnGap: 4,
      },
    ],
  };
}

function barChartBlock(title: string, rows: NamedValue[], opts?: { maxBars?: number; unit?: string }) {
  const unit = opts?.unit ?? '%';
  const items = rows.slice(0, opts?.maxBars ?? 10);
  if (!items.length) {
    return {
      stack: [
        { text: title, style: 'subsection' },
        { text: 'No comparison data.', color: MUTED, italics: true, fontSize: 8 },
      ],
    };
  }

  const chartWidth = 280;
  const barHeight = 8;
  const labelWidth = 100;
  const valueWidth = 36;
  const max = Math.max(...items.map((row) => row.value), 1);

  const bars = items.map((row) => {
    const width = Math.max(3, Math.round((Math.max(0, row.value) / max) * chartWidth));
    return {
      columns: [
        {
          width: labelWidth,
          text: row.label.length > 20 ? `${row.label.slice(0, 19)}...` : row.label,
          fontSize: 7,
          color: INK,
          margin: [0, 1, 4, 0],
        },
        {
          width: chartWidth,
          canvas: [
            { type: 'rect', x: 0, y: 1, w: chartWidth, h: barHeight, color: '#eaecf0', lineWidth: 0 },
            { type: 'rect', x: 0, y: 1, w: width, h: barHeight, color: row.color, lineWidth: 0 },
          ],
        },
        {
          width: valueWidth,
          text: `${Number(row.value).toFixed(row.value % 1 ? 1 : 0)}${unit}`,
          alignment: 'right',
          bold: true,
          fontSize: 7,
          color: row.color,
          margin: [4, 1, 0, 0],
        },
      ],
      margin: [0, 0, 0, 3],
    };
  });

  return {
    stack: [{ text: title, style: 'subsection' }, ...bars],
  };
}

function scoreColor(score: number) {
  if (score >= 75) return '#059669';
  if (score >= 50) return '#d97706';
  return '#e11d48';
}

function sectionTitle(text: string, withBreak = false) {
  return {
    stack: [
      {
        text,
        style: 'section',
        ...(withBreak ? { pageBreak: 'before' as const } : {}),
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH_CONTENT, y2: 0, lineWidth: 0.75, lineColor: RULE }],
        margin: [0, 2, 0, 8],
      },
    ],
  };
}

/** Warm official sign-off for the school-facing PDF (no internal tooling language). */
function buildOfficialClosingRemark(
  snapshot: SchoolPerformanceReportRow['snapshot'],
  narrative: SchoolPerformanceReportRow['narrative'],
): string {
  const term = snapshot.period?.termLabel || 'this term';
  const year = snapshot.period?.academicYear || '';
  const school = snapshot.school?.name || 'our partner school';
  const highlight =
    narrative.achievements[0]?.replace(/\.$/, '') ||
    (snapshot.summary.averageScore >= 65
      ? 'the solid progress your learners made'
      : 'the dedication your teachers and learners showed');
  return `Rillcod Technologies sincerely appreciates ${school} for the trust and collaboration shared throughout ${term}${year ? `, ${year}` : ''}. We are proud to celebrate ${highlight.toLowerCase()}, while remaining committed to purposeful support that helps every learner grow in confidence and ability. Together, we look forward to the next learning period with renewed energy, clear priorities, and even stronger outcomes.`;
}

function topicsCoveredText(
  narrative: SchoolPerformanceReportRow['narrative'],
  insights: ReturnType<typeof resolveSchoolReportInsights> | undefined,
  snapshot: SchoolPerformanceReportRow['snapshot'],
): string {
  const custom = String(narrative.topicsCovered || '').trim();
  if (custom) return custom;
  if (insights?.topicsProseSeed) return insights.topicsProseSeed;
  const draft = buildTopicsCoveredDraft(snapshot);
  if (draft.trim()) return draft;
  if (insights?.academicCoverage?.length) return insights.academicCoverage.slice(0, 3).join(' ');
  return '';
}

export function buildSchoolReportPdfDefinition(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative'] },
) {
  const rawSnapshot = report.snapshot;
  const mappedCoverage = rawSnapshot.curriculum.plannedWeeks > 0
    ? Math.round((rawSnapshot.curriculum.completedWeeks / rawSnapshot.curriculum.plannedWeeks) * 100)
    : 0;
  const reliableCoverage = rawSnapshot.deliveryDeclaration ? rawSnapshot.summary.curriculumCoverage : mappedCoverage;
  const snapshot = {
    ...rawSnapshot,
    summary: { ...rawSnapshot.summary, curriculumCoverage: reliableCoverage },
  };
  const narrative = opts?.narrative || report.narrative;
  const design = normalizeSchoolReportDesign(report.design);
  const BRAND = design.accentColor;
  const showSec = (key: SchoolReportSectionKey) => showReportSection(design, key);
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const logo = design.showLogo ? loadBrandLogoDataUrl() : null;
  const officialSignature = loadOfficialSignatureDataUrl();
  const isPublished = report.status === 'published';
  const period = `${new Date(report.period_start).toLocaleDateString('en-GB')} - ${new Date(report.period_end).toLocaleDateString('en-GB')}`;
  const curriculumRange = `Term ${report.curriculum_start_term} Week ${report.curriculum_start_week}  to  Term ${report.curriculum_end_term} Week ${report.curriculum_end_week}`;
  const generatedLabel = new Date(snapshot.generatedAt || report.updated_at || Date.now()).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const classRows = snapshot.classPerformance.length
    ? snapshot.classPerformance.map((row) => [
        { text: cleanDisplayText(row.className), fontSize: 8 },
        { text: row.teacherName || '-', fontSize: 7.5, color: MUTED },
        { text: String(row.students), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.averageScore), fontSize: 8, alignment: 'right', bold: true },
        { text: fmtPct(row.attendanceRate), fontSize: 8, alignment: 'right' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
      ])
    : [[{ text: 'No class data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  const staffTeachers = Array.isArray(snapshot.staff?.teachers) ? snapshot.staff.teachers : [];
  const staffRows = staffTeachers.length
    ? staffTeachers.map((row) => [
        { text: row.name, fontSize: 8 },
        {
          text:
            row.source === 'both'
              ? 'Assigned + class owner'
              : row.source === 'teacher_schools'
                ? 'School assignment'
                : 'Class owner',
          fontSize: 7.5,
          color: MUTED,
        },
        { text: String(row.classCount), fontSize: 8, alignment: 'center' },
        { text: row.classNames.length ? row.classNames.join(', ') : '-', fontSize: 7.5 },
      ])
    : [[{ text: 'No teachers assigned to this school', colSpan: 4, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}]];

  const curriculumRows = snapshot.curriculum.courses.length
    ? snapshot.curriculum.courses.map((row) => [
        { text: row.course, fontSize: 8 },
        { text: row.programme, fontSize: 7.5, color: MUTED },
        { text: `${row.completed}/${row.planned}`, fontSize: 8, alignment: 'center' },
        { text: String(row.inProgress), fontSize: 8, alignment: 'center' },
        { text: String(row.skipped), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No curriculum data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  const programmeRows = snapshot.programmeCoursePerformance.length
    ? snapshot.programmeCoursePerformance.map((row) => [
        { text: row.programme, fontSize: 8 },
        { text: row.course, fontSize: 8 },
        { text: String(row.students), fontSize: 8, alignment: 'center' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.averageScore), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No programme/course data', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const cumulativeProgrammeEnrolments = snapshot.programmeCoursePerformance.reduce(
    (sum, row) => sum + Math.max(Number(row.students || 0), Number(row.enrolledStudents || 0)),
    0,
  );
  const uniqueLearners = learners.length || snapshot.summary.activeStudents;

  const invoiceRows = snapshot.finance.invoices.length
    ? snapshot.finance.invoices.map((invoice) => [
        { text: invoice.invoiceNumber, fontSize: 8 },
        { text: plainStatus(invoice.status), fontSize: 7.5 },
        { text: formatMoney(invoice.amount, snapshot.finance.currency), fontSize: 8, alignment: 'right' },
        { text: formatMoney(invoice.paid, snapshot.finance.currency), fontSize: 8, alignment: 'right' },
        { text: formatMoney(invoice.outstanding, snapshot.finance.currency), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No matching invoice for this term/year', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const learnerRows = learners.length
    ? learners.map((row) => {
        const labels = resolveLearnerGradeForDisplay(row);
        return [
        { text: row.name, fontSize: 7.5 },
        { text: labels.gradeLabel, fontSize: 7.5, bold: true },
        { text: cleanDisplayText(labels.classLabel), fontSize: 7, color: MUTED },
        { text: fmtPct(row.averageScore), fontSize: 7.5, alignment: 'right' },
        { text: fmtPct(row.attendanceRate), fontSize: 7.5, alignment: 'right' },
        {
          text: row.status,
          fontSize: 7,
          color:
            row.status === 'Needs support' || row.status === 'Attendance risk'
              ? '#b42318'
              : row.status === 'Excellent'
                ? '#067647'
                : INK,
        },
      ];
      })
    : [
        [
          {
            text: 'Learner roster unavailable in this snapshot. Regenerate the report to include the child list.',
            colSpan: 6,
            color: MUTED,
            italics: true,
            fontSize: 8,
          },
          {},
          {},
          {},
          {},
          {},
          {},
        ],
      ];

  const curriculumBands: Band[] = [
    { label: 'Completed', count: snapshot.curriculum.completedWeeks, color: '#059669' },
    { label: 'In progress', count: snapshot.curriculum.inProgressWeeks, color: '#d97706' },
    { label: 'Skipped', count: snapshot.curriculum.skippedWeeks, color: '#e11d48' },
  ];
  const programmeCoverageMap = new Map<string, { completed: number; planned: number }>();
  for (const row of snapshot.programmeCoursePerformance) {
    if (!programmeCoverageMap.has(row.programme)) {
      programmeCoverageMap.set(row.programme, { completed: 0, planned: 0 });
    }
  }
  for (const row of snapshot.curriculum.courses) {
    const current = programmeCoverageMap.get(row.programme) || { completed: 0, planned: 0 };
    current.completed += Number(row.completed || 0);
    current.planned += Number(row.planned || 0);
    programmeCoverageMap.set(row.programme, current);
  }
  const declaredProgrammeCoverage = snapshot.deliveryDeclaration?.programmeCoverage || [];
  const programmeCoverageRows = declaredProgrammeCoverage.length
    ? declaredProgrammeCoverage.map((row) => ({ label: row.programme, value: row.coverage, color: scoreColor(row.coverage) }))
    : [...programmeCoverageMap.entries()].map(([programme, totals]) => ({
        label: programme,
        value: totals.planned > 0 ? Math.round((totals.completed / totals.planned) * 100) : 0,
        color: scoreColor(totals.planned > 0 ? Math.round((totals.completed / totals.planned) * 100) : 0),
      }));

  const financeBands: Band[] = [
    { label: 'Paid', count: Math.max(0, Math.round(snapshot.finance.totalPaid)), color: '#059669' },
    {
      label: 'Outstanding',
      count: Math.max(0, Math.round(snapshot.finance.totalOutstanding)),
      color: '#b42318',
    },
  ].filter((band) => band.count > 0);

  const insights = resolveSchoolReportInsights(snapshot);
  const paymentAccounts = snapshot.finance.paymentAccounts || [];
  const topicsText = topicsCoveredText(narrative, insights, snapshot);
  const sourceDeliveryLedger: DeliveryLedger =
    insights?.deliveryLedger ||
    buildDeliveryLedger(snapshot, {
      nextLines: narrative.nextPeriodFocus?.length
        ? narrative.nextPeriodFocus
        : insights?.deliveryCommitment?.next || insights?.nextModuleFocus || [],
      curriculumRange: curriculumRange,
      programmeNames: Array.from(
        new Set((snapshot.curriculum.courses || []).map((row) => row.programme).filter(Boolean)),
      ),
      evidenceQualityPct: insights?.evidenceQualityPct ?? 0,
    });
  const deliveryLedger: DeliveryLedger = {
    ...sourceDeliveryLedger,
    evidenceLines: sourceDeliveryLedger.evidenceLines.map((line) =>
      line.includes('curriculum weeks marked on the map')
        ? `${snapshot.curriculum.completedWeeks}/${snapshot.curriculum.plannedWeeks} curriculum weeks marked on the map (${reliableCoverage}%).`
        : line,
    ),
  };
  const programmeReflections = deliveryLedger.topicRows.map((row) => {
    const spotlight = insights?.programmeSpotlights?.find(
      (item) => item.programme === row.programme && item.course === row.course,
    );
    return {
      programme: row.programme,
      course: row.course,
      summary: spotlight?.summary || row.evidence,
      nextIntro: spotlight?.nextIntro || `Continue ${row.programme} | ${row.course} from this term's evidence.`,
    };
  });
  const programmeReflectionByKey = new Map(
    programmeReflections.map((row) => [`${row.programme}::${row.course}`, row]),
  );
  const showDelivery = showSec('deliverySummary') || Boolean(topicsText);
  const logoStack = logo
    ? [{ image: logo, width: 40, height: 40, margin: [0, 0, 0, 0] as [number, number, number, number] }]
    : [{ text: '', width: 40 }];

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 48],
    info: {
      title: report.title,
      author: brandContact.displayName,
      subject: 'School Performance & Curriculum Report',
      creator: brandContact.legalName,
      keywords: 'Rillcod, school performance, STEM education',
    },
    header: (currentPage: number) =>
      currentPage === 1
        ? null
        : {
            margin: [40, 16, 40, 0],
            columns: [
              {
                width: '*',
                stack: [
                  {
                    text: brandContact.legalName,
                    color: BRAND,
                    bold: true,
                    fontSize: 7.5,
                    characterSpacing: 0.6,
                  },
                  {
                    text: 'School Performance & Curriculum Report',
                    color: MUTED,
                    fontSize: 7,
                    margin: [0, 1, 0, 0],
                  },
                ],
              },
              {
                width: '*',
                stack: [
                  { text: snapshot.school.name, color: INK, fontSize: 7.5, alignment: 'right', bold: true },
                  { text: period, color: MUTED, fontSize: 7, alignment: 'right', margin: [0, 1, 0, 0] },
                ],
              },
            ],
          },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 0, 40, 18],
      stack: [
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH_CONTENT, y2: 0, lineWidth: 0.6, lineColor: RULE }],
          margin: [0, 0, 0, 6],
        },
        {
          columns: [
            {
              width: '*',
              text: `${isPublished ? 'Published partner copy' : 'INTERNAL DRAFT - not for school release'}  |  ${brandContactLine('  |  ')}`,
              color: MUTED,
              fontSize: 6.5,
            },
            {
              width: 70,
              text: `Page ${currentPage} of ${pageCount}`,
              color: MUTED,
              fontSize: 6.5,
              alignment: 'right',
            },
          ],
        },
      ],
    }),
    content: [
      // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Letterhead ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
      {
        columns: [
          { width: 52, stack: logoStack },
          {
            width: '*',
            stack: [
              {
                text: brandContact.legalName,
                color: BRAND,
                bold: true,
                fontSize: 11.5,
                characterSpacing: 0.8,
              },
              {
                text: brandContact.tagline,
                color: MUTED,
                fontSize: 7.5,
                margin: [0, 2, 0, 3],
              },
              { text: brandContactLine('   |   '), color: MUTED, fontSize: 6.5 },
              { text: brandContact.addressShort, color: MUTED, fontSize: 6.5, margin: [0, 1, 0, 0] },
            ],
          },
          {
            width: 132,
            stack: [
              {
                table: {
                  widths: ['*'],
                  body: [
                    [{ text: 'SCHOOL PERFORMANCE &\nCURRICULUM REPORT', color: '#ffffff', bold: true, fontSize: 7.5, lineHeight: 1.2, fillColor: HEADER_BG, alignment: 'center', margin: [8, 7, 8, 7] }],
                    [{ stack: [{ text: snapshot.school.name, color: INK, bold: true, fontSize: 6.5, alignment: 'center' }, { text: isPublished ? 'PUBLISHED REVISION' : 'DRAFT PREVIEW', color: isPublished ? '#067647' : BRAND, bold: true, fontSize: 6, alignment: 'center', margin: [0, 2, 0, 0] }], fillColor: isPublished ? '#ecfdf3' : '#fef2f2', margin: [6, 4, 6, 4] }],
                  ],
                },
                layout: 'noBorders',
                alignment: 'right',
              },
            ],
          },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 8],
      },
      brandAccentRule(),

      // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Period & snapshot meta (single panel) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              {
                stack: [
                  { text: 'ACADEMIC PERIOD', style: 'metaLabel' },
                  { text: period, style: 'metaValue', fontSize: 8.5 },
                ],
              },
              {
                stack: [
                  { text: 'GENERATED', style: 'metaLabel' },
                  { text: `Generated ${generatedLabel}`, style: 'metaValue', fontSize: 8.5 },
                  {
                    text: `Version ${snapshot.snapshotVersion || 1}  |  ${snapshot.summary.activeTeachers} teachers  |  ${snapshot.summary.activeStaff} staff`,
                    color: MUTED,
                    fontSize: 7.5,
                    margin: [0, 2, 0, 0],
                  },
                ],
              },
            ],
          ],
        },
        layout: borderedPanelLayout('#f9fafb'),
        margin: [0, 0, 0, 12],
      },

      // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Key metrics (one row - no duplicate blocks) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
      {
        columns: [
          compactMetric(
            cumulativeProgrammeEnrolments > uniqueLearners ? 'Programme enrolments' : 'Learners',
            String(cumulativeProgrammeEnrolments || uniqueLearners),
            cumulativeProgrammeEnrolments > uniqueLearners
              ? `${uniqueLearners} unique learners`
              : `${snapshot.summary.studentsWithScores} with term scores`,
            '#1d4ed8',
          ),
          compactMetric(
            'Avg score',
            fmtPct(snapshot.summary.averageScore),
            `${snapshot.summary.studentsWithScores}/${snapshot.summary.activeStudents} learners assessed`,
            '#059669',
          ),
          compactMetric(
            'Attendance',
            fmtPct(snapshot.summary.attendanceRate),
            'Present + late',
            '#0f766e',
          ),
          compactMetric(
            snapshot.deliveryDeclaration ? 'Declared delivery' : 'Mapped curriculum',
            fmtPct(snapshot.summary.curriculumCoverage),
            `${snapshot.curriculum.completedWeeks}/${snapshot.curriculum.plannedWeeks} weeks`,
            BRAND,
          ),
          compactMetric(
            'Term invoice',
            snapshot.finance.attached
              ? formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency)
              : 'Not linked',
            snapshot.finance.attached
              ? `${snapshot.finance.invoiceCount} invoice(s) on file`
              : 'Attach in School Billing',
            snapshot.finance.attached ? '#2563eb' : '#b42318',
          ),
        ],
        columnGap: 10,
        margin: [0, 0, 0, 10],
      },

      ...(showDelivery
        ? [
            sectionTitle('Delivery this term', false),
            {
              text: 'What we taught, programme delivery ranges, and what opens next - one clear flow for school leadership.',
              color: MUTED,
              fontSize: 7.5,
              margin: [0, 0, 0, 6],
            },
            {
              text: deliveryLedger.windowLine,
              fontSize: 8,
              color: INK,
              bold: true,
              margin: [0, 0, 0, 8],
            },
            ...(deliveryLedger.plannedLines[1]
              ? [{ text: deliveryLedger.plannedLines[1], fontSize: 7.5, color: MUTED, margin: [0, 0, 0, 8] }]
              : []),
            ...(topicsText
              ? [
                  borderedSegment('1  |  What we taught', [
                    { text: topicsText, fontSize: 9.5, color: INK, lineHeight: 1.45 },
                  ], BRAND),
                ]
              : []),
            ...(deliveryLedger.topicRows.length
              ? [
                  borderedSegment(
                    `${topicsText ? '2  |  ' : ''}Curriculum delivery`,
                    [
                      {
                        table: {
                          headerRows: 1,
                          dontBreakRows: true,
                          widths: ['22%', '22%', '*', '*'],
                          body: [
                            headerCells(['Programme', 'Course', 'Delivery range', 'Evidence & next step']),
                            ...deliveryLedger.topicRows.map((row) => {
                              const reflection = programmeReflectionByKey.get(`${row.programme}::${row.course}`);
                              return [
                                { text: row.programme, fontSize: 7.5, bold: true },
                                { text: row.course, fontSize: 7.5 },
                                { text: row.weekRange, fontSize: 7.5, color: MUTED },
                                {
                                  stack: [
                                    { text: row.evidence, fontSize: 7.25, color: MUTED },
                                    ...(reflection?.nextIntro
                                      ? [{ text: reflection.nextIntro, fontSize: 7.25, color: INK, margin: [0, 2, 0, 0] }]
                                      : []),
                                  ],
                                },
                              ];
                            }),
                          ],
                        },
                        layout: tableLayout(),
                        margin: [0, 0, 0, 4] as [number, number, number, number],
                      },
                      {
                        text: deliveryLedger.pathNote,
                        fontSize: 7,
                        color: MUTED,
                        italics: true,
                      },
                    ],
                  ),
                ]
              : []),
          ]
        : []),

      ...(showSec('moduleCoverage') && !deliveryLedger.topicRows.length && insights?.moduleCoverage?.length
        ? [
            sectionTitle('Topics & module coverage', false),
            {
              text: 'Programmes and courses covered during this term - week-by-week delivery evidence.',
              color: MUTED,
              fontSize: 8,
              margin: [0, 0, 0, 6],
            },
            {
              table: {
                headerRows: 1,
                dontBreakRows: true,
                widths: ['*', '*', 42, 42, 42, 58],
                body: [
                  headerCells(['Programme', 'Course', 'Done', 'Plan', 'Cover %', 'Status']),
                  ...insights.moduleCoverage.map((row) => [
                    { text: row.programme, fontSize: 7.5 },
                    { text: row.course, fontSize: 7.5 },
                    { text: String(row.completed), fontSize: 8, alignment: 'center' },
                    { text: String(row.planned), fontSize: 8, alignment: 'center' },
                    { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right' },
                    { text: row.status, fontSize: 7.5, color: row.status === 'Complete' ? '#067647' : MUTED },
                  ]),
                ],
              },
              layout: tableLayout(),
              margin: [0, 0, 0, 8] as [number, number, number, number],
            },
          ]
        : []),
      ...(!programmeReflections.length && insights?.programmeSpotlight && !showSec('moduleCoverage')
          ? [
              {
                stack: [
                  { text: 'Curriculum delivery', style: 'subsection', color: BRAND },
                  {
                    text: `${insights.programmeSpotlight.programme}  |  ${insights.programmeSpotlight.course}`,
                    bold: true,
                    fontSize: 9,
                    color: INK,
                    margin: [0, 0, 0, 2],
                  },
                  { text: insights.programmeSpotlight.summary, fontSize: 8, color: MUTED, margin: [0, 0, 0, 2] },
                  { text: insights.programmeSpotlight.nextIntro, fontSize: 8, color: INK },
                ],
                margin: [0, 0, 0, 8] as [number, number, number, number],
              },
            ]
          : []),
      ...(showSec('learnerHighlights') &&
      (insights?.learnerHighlights?.length || insights?.celebrationWall?.length)
        ? [
            sectionTitle('Learner highlights', false),
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    borderedSegment(
                      'Learner highlights',
                      [textList((insights?.learnerHighlights || []).slice(0, 3).map(briefLearnerLine), '#067647')],
                      '#067647',
                    ),
                  ],
                },
                { width: 10, text: '' },
                {
                  width: '*',
                  stack: [
                    borderedSegment(
                      'Celebration wall',
                      insights?.celebrationWall?.length
                        ? insights.celebrationWall.slice(0, 3).map((row) => ({
                            text: `- ${row.name} (${row.className}) - ${briefLearnerLine(`Result: ${String(row.highlight)}`).replace(/^Result:\s*/, '')}`,
                            fontSize: 8,
                            color: INK,
                            margin: [0, 0, 0, 2] as [number, number, number, number],
                          }))
                        : [{ text: 'No Excellent band learners this term.', color: MUTED, italics: true, fontSize: 8 }],
                      BRAND,
                    ),
                  ],
                },
              ],
              columnGap: 8,
              margin: [0, 0, 0, 8] as [number, number, number, number],
            },
          ]
        : []),
      ...(showSec('communityMessage')
        ? [
            {
              stack: [
                { text: 'Message for your school community', style: 'subsection', color: BRAND },
                {
                  text: insights?.communityMessage || narrative.executiveSummary,
                  fontSize: 8.5,
                  lineHeight: 1.35,
                  color: INK,
                  margin: [0, 0, 0, 4],
                },
                {
                  text: design.reviewDateNote || insights?.suggestedPartnershipReview || '',
                  fontSize: 7.5,
                  color: MUTED,
                  italics: true,
                },
              ],
              margin: [0, 0, 0, 10] as [number, number, number, number],
            },
          ]
        : []),

      ...(showSec('boardBriefing')
        ? [
            sectionTitle('Partnership briefing'),
      {
        columns: [
          {
            width: '*',
            stack: [
              borderedSegment(
                'Strengths & excellence',
                [textList(briefExecutiveItems(narrative.achievements.length ? narrative.achievements : insights?.strengths || []), '#067647')],
                '#067647',
              ),
            ],
          },
          { width: 10, text: '' },
          {
            width: '*',
            stack: [
              borderedSegment(
                'Partnership focus',
                [textList(briefExecutiveItems(narrative.concerns.length ? narrative.concerns : insights?.partnershipFocus || [], 3, 120), BRAND)],
                BRAND,
              ),
            ],
          },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 6],
      },
      ...(insights?.risks?.length
        ? [
            {
              stack: [
                { text: 'Cases needing immediate joint care', style: 'subsection', color: '#b42318' },
                textList(insights.risks, '#b42318'),
              ],
              margin: [0, 0, 0, 6] as [number, number, number, number],
            },
          ]
        : []),
      {
        stack: [
          { text: 'Recommendations for students', style: 'subsection' },
          {
            ol: briefExecutiveItems(narrative.recommendations.length ? narrative.recommendations : insights?.priorities || [], 3),
            fontSize: 8.5,
            color: INK,
            lineHeight: 1.35,
          },
        ],
        margin: [0, 0, 0, 8],
      },
          ]
        : []),
      ...(showSec('nextPhase') && !showSec('deliverySummary')
        ? [
            sectionTitle('Progressive next phase'),
      {
        text: 'A clear path so the school and every learner stay involved - not a one-off score sheet.',
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 6],
      },
      ...((insights?.nextPhaseSchool || []).map((phase) => ({
        stack: [
          { text: phase.phase, bold: true, fontSize: 9, color: INK, margin: [0, 0, 0, 1] },
          { text: phase.horizon, color: MUTED, fontSize: 7.5, margin: [0, 0, 0, 2] },
          textList(phase.actions),
        ],
        margin: [0, 0, 0, 4],
      })) as any[]),
      {
        stack: [
          { text: 'How everyone stays involved', style: 'subsection' },
          textList(insights?.involvement || []),
        ],
        margin: [0, 2, 0, 8],
      },
      ...(insights?.nextPhaseLearners?.length
        ? [
            {
              table: {
                headerRows: 1,
                dontBreakRows: true,
                widths: [90, 36, '*'],
                body: [
                  headerCells(['Learner band', 'Count', 'Next phase for this band']),
                  ...insights.nextPhaseLearners.map((row) => [
                    { text: row.band, fontSize: 8, bold: true },
                    { text: String(row.count), fontSize: 8, alignment: 'center' },
                    { text: row.nextStep, fontSize: 7.5, color: MUTED },
                  ]),
                ],
              },
              layout: tableLayout(),
              margin: [0, 0, 0, 10],
            },
          ]
        : []),
          ]
        : []),

      sectionTitle('Performance overview'),
      {
        columns: [
          { width: '*', stack: [progressBar('Average score', snapshot.summary.averageScore, '#059669')] },
          { width: 10, text: '' },
          { width: '*', stack: [progressBar('Attendance', snapshot.summary.attendanceRate, '#0f766e')] },
          { width: 10, text: '' },
          {
            width: '*',
            stack: [progressBar('Curriculum coverage', snapshot.summary.curriculumCoverage, BRAND)],
          },
        ],
        margin: [0, 0, 0, 6],
      },

      ...(showSec('charts')
        ? [
            { text: 'Score and attendance distribution', style: 'subsection', color: BRAND },
      {
        columns: [
          {
            width: '*',
            ...pieChartBlock('Score bands', snapshot.scoreBands, { size: 92 }),
          },
          {
            width: '*',
            ...pieChartBlock('Attendance bands', snapshot.attendanceBands, { size: 92 }),
          },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 6],
      },
      ...(programmeCoverageRows.length
        ? [
            barChartBlock('Curriculum coverage by programme', programmeCoverageRows, {
              maxBars: 8,
            }),
          ]
        : []),
      {
        text: 'Class comparison',
        style: 'subsection',
        color: BRAND,
        margin: [0, 4, 0, 2],
      },
      barChartBlock(
        'Class average scores',
        snapshot.classPerformance.map((row) => ({
          label: cleanDisplayText(row.className),
          value: row.averageScore,
          color: scoreColor(row.averageScore),
        })),
        { maxBars: 10 },
      ),
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 70, 42, 48, 52, 42],
          body: [headerCells(['Class', 'Teacher', 'Learners', 'Avg %', 'Attend %', 'Subs']), ...classRows],
        },
        layout: tableLayout(),
        margin: [0, 8, 0, 10],
      },
          ]
        : []),
      ...(showSec('teacherRoster')
        ? [
            sectionTitle('Assigned teachers'),
      {
        text: 'Only teachers assigned to this school (via school assignment and/or class ownership) are counted. Platform-wide tutors are excluded.',
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 100, 42, '*'],
          body: [headerCells(['Teacher', 'How assigned', 'Classes', 'Class list']), ...staffRows],
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 10],
      },
          ]
        : []),

      ...(!showSec('moduleCoverage')
        ? [
            sectionTitle('Curriculum & courses'),
      {
        text: `${snapshot.curriculum.completedWeeks} completed  |  ${snapshot.curriculum.inProgressWeeks} in progress  |  ${snapshot.curriculum.skippedWeeks} skipped  |  ${snapshot.curriculum.plannedWeeks} planned`,
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 72, 40, 40, 40, 42],
          body: [
            headerCells(['Course', 'Programme', 'Done', 'Ongoing', 'Skip', 'Cover']),
            ...curriculumRows,
          ],
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 10],
      },
      barChartBlock(
        'Programme / course averages',
        snapshot.programmeCoursePerformance.map((row) => ({
          label: `${row.programme} - ${row.course}`,
          value: row.averageScore,
          color: scoreColor(row.averageScore),
        })),
        { maxBars: 10 },
      ),
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [88, '*', 42, 48, 42],
          body: [
            headerCells(['Programme', 'Course', 'Learners', 'Graded', 'Avg %']),
            ...programmeRows,
          ],
        },
        layout: tableLayout(),
        margin: [0, 6, 0, 8],
      },
          ]
        : []),

      ...(showSec('finance')
        ? [
            sectionTitle('School invoices (this term)'),
      {
        text: snapshot.finance.attached
          ? `Attached ${snapshot.finance.invoiceCount} invoice(s) for ${snapshot.period.termLabel}, ${snapshot.period.academicYear}. Amounts below match School Billing at snapshot time.`
          : snapshot.finance.requestMessage ||
            `No school invoice matched ${snapshot.period.termLabel}, ${snapshot.period.academicYear}. Create the term invoice in School Billing, label it with this term and year, then refresh this report.`,
        color: snapshot.finance.attached ? MUTED : '#b42318',
        bold: !snapshot.finance.attached,
        fontSize: 8,
        margin: [0, 0, 0, 4],
      },
      snapshot.finance.attached
        ? {
            text: `Billing: ${brandContact.web}  |  School Billing  |  pay using the invoice number below.`,
            color: MUTED,
            fontSize: 7,
            margin: [0, 0, 0, 4],
          }
        : { text: '', margin: [0, 0, 0, 0] },
      !snapshot.finance.attached
        ? {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      { text: 'INVOICE REQUIRED TO COMPLETE THIS BOOK', bold: true, color: '#b42318', fontSize: 8 },
                      {
                        text: 'Open School Billing, create or label the invoice for this academic term/year, then use Refresh snapshot data on the report.',
                        color: INK,
                        fontSize: 8,
                        margin: [0, 3, 0, 0],
                      },
                    ],
                    fillColor: '#fff5f5',
                    margin: [8, 8, 8, 8],
                  },
                ],
              ],
            },
            layout: { hLineColor: () => '#fecaca', vLineColor: () => '#fecaca' },
            margin: [0, 0, 0, 6],
          }
        : { text: '', margin: [0, 0, 0, 0] },
      {
        columns: [
          compactMetric(
            'Invoiced',
            formatMoney(snapshot.finance.totalInvoiced, snapshot.finance.currency),
            `${snapshot.finance.invoiceCount} matching`,
            '#2563eb',
          ),
          compactMetric(
            'Paid',
            formatMoney(snapshot.finance.totalPaid, snapshot.finance.currency),
            'Recorded payments',
            '#059669',
          ),
          compactMetric(
            'Outstanding',
            formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency),
            'Still due',
            '#b42318',
          ),
        ],
        columnGap: 6,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 70, 70, 66, 66],
          body: [headerCells(['Invoice', 'Status', 'Amount', 'Paid', 'Balance']), ...invoiceRows],
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 6],
      },
      paymentAccountsBlock(paymentAccounts),
          ]
        : []),

      ...(showSec('learnerRoster')
        ? [
            sectionTitle('Learner roster', learners.length > 25),
      {
        text: learners.length
          ? `${learners.length} active learners in this term book - sorted by grade, class, and name.`
          : 'Regenerate this report to attach the full learner list to the book.',
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 4],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 46, 64, 44, 48, 76],
          body: [
            headerCells(['Learner', 'Grade', 'Class', 'Score', 'Attend', 'Status']),
            ...learnerRows,
          ],
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 8],
      },
          ]
        : []),

      sectionTitle('Closing remark', false),
      {
        text: buildOfficialClosingRemark(snapshot, narrative),
        fontSize: 9,
        lineHeight: 1.4,
        color: INK,
        italics: true,
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: [190, '*'],
          body: [[
            {
              stack: [
                { text: 'AUTHORISED SIGNATORY', style: 'metaLabel', color: BRAND },
                ...(officialSignature
                  ? [{ image: officialSignature, width: 118, height: 44, margin: [0, 5, 0, 1] as [number, number, number, number] }]
                  : [{ text: '', margin: [0, 36, 0, 0] as [number, number, number, number] }]),
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.8, lineColor: INK }] },
                { text: 'Mr Osahon', bold: true, fontSize: 9, margin: [0, 3, 0, 0] },
                { text: 'Director, Rillcod Technologies', color: MUTED, fontSize: 7.5 },
              ],
            },
            {
              stack: [
                { text: isPublished ? 'OFFICIALLY ISSUED' : 'DRAFT PREVIEW', style: 'metaLabel', color: isPublished ? '#067647' : BRAND, alignment: 'right' },
                { text: `${snapshot.period.termLabel}  |  ${snapshot.period.academicYear}`, bold: true, fontSize: 9, alignment: 'right', margin: [0, 8, 0, 2] },
                { text: `Generated ${generatedLabel}`, color: MUTED, fontSize: 7.5, alignment: 'right' },
                { text: isPublished ? 'This signature authenticates the published report revision.' : 'The signature is shown for layout review. Publish the report to issue the official revision.', color: MUTED, fontSize: 7, alignment: 'right', margin: [0, 8, 0, 0] },
              ],
            },
          ]],
        },
        layout: borderedPanelLayout('#f9fafb'),
        margin: [0, 8, 0, 8],
      },
      {
        text: `Prepared by ${brandContact.displayName}  |  ${brandContact.web}. This document is the official school-facing report for ${snapshot.period.termLabel}, ${snapshot.period.academicYear}.`,
        color: MUTED,
        fontSize: 7,
        margin: [0, 2, 0, 0],
      },
    ],
    styles: {
      section: {
        fontSize: 11,
        bold: true,
        color: INK,
        margin: [0, 10, 0, 0],
      },
      subsection: {
        fontSize: 9,
        bold: true,
        color: INK,
        margin: [0, 4, 0, 3],
      },
      metaLabel: {
        fontSize: 6.5,
        bold: true,
        color: MUTED,
        characterSpacing: 0.7,
        margin: [0, 0, 0, 2],
      },
      metaValue: {
        fontSize: 9,
        bold: true,
        color: INK,
      },
      tableHeader: { color: '#ffffff', bold: true, fontSize: 7 },
    },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: INK },
  };
}

export async function renderSchoolReportPdf(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative'] },
): Promise<Buffer> {
  let enriched = report;
  if (!report.snapshot?.finance?.paymentAccounts?.length) {
    try {
      const admin = createAdminClient() as any;
      const paymentAccounts = await loadSchoolReportPaymentAccounts(admin);
      if (paymentAccounts.length) {
        enriched = {
          ...report,
          snapshot: {
            ...report.snapshot,
            finance: {
              ...report.snapshot.finance,
              paymentAccounts,
            },
          },
        };
      }
    } catch (error) {
      console.warn('[school-report] Could not load payment accounts for PDF:', error);
    }
  }
  return renderPdfToBuffer(buildSchoolReportPdfDefinition(enriched, opts));
}
