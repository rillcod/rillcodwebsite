import fs from 'node:fs';
import path from 'node:path';
import { brandContact, brandContactLine } from '@/config/brand';
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

type Band = { label: string; count: number; color: string };
type NamedValue = { label: string; value: number; color: string };

function loadBrandLogoDataUrl(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'images', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'logo.png'),
  ];
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

const textList = (items: string[], color = INK) =>
  items.length
    ? { ul: items, color, fontSize: 9, lineHeight: 1.35, margin: [0, 2, 0, 6] }
    : { text: 'No items recorded.', color: MUTED, italics: true, fontSize: 8, margin: [0, 2, 0, 6] };

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
  value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;

/** Open metric cell — no filled cards; keeps the page calm and official. */
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

function headerCells(labels: string[]) {
  return labels.map((text) => ({ text, style: 'tableHeader' }));
}

function brandAccentRule() {
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: PAGE_WIDTH_CONTENT, h: 2.5, color: BRAND, lineWidth: 0 },
      { type: 'rect', x: 0, y: 2.5, w: PAGE_WIDTH_CONTENT, h: 0.75, color: RULE, lineWidth: 0 },
    ],
    margin: [0, 0, 0, 8],
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
          text: row.label.length > 20 ? `${row.label.slice(0, 19)}…` : row.label,
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

export function buildSchoolReportPdfDefinition(report: SchoolPerformanceReportRow) {
  const snapshot = report.snapshot;
  const narrative = report.narrative;
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const logo = loadBrandLogoDataUrl();
  const isPublished = report.status === 'published';
  const period = `${new Date(report.period_start).toLocaleDateString('en-GB')} – ${new Date(report.period_end).toLocaleDateString('en-GB')}`;
  const curriculumRange = `Term ${report.curriculum_start_term} Week ${report.curriculum_start_week} → Term ${report.curriculum_end_term} Week ${report.curriculum_end_week}`;
  const generatedLabel = new Date(snapshot.generatedAt || report.updated_at || Date.now()).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const classRows = snapshot.classPerformance.length
    ? snapshot.classPerformance.map((row) => [
        { text: row.className, fontSize: 8 },
        { text: row.teacherName || '—', fontSize: 7.5, color: MUTED },
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
        { text: row.classNames.length ? row.classNames.join(', ') : '—', fontSize: 7.5 },
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
    ? learners.map((row) => [
        { text: row.name, fontSize: 7.5 },
        { text: row.className, fontSize: 7, color: MUTED },
        { text: fmtPct(row.averageScore), fontSize: 7.5, alignment: 'right' },
        { text: fmtPct(row.attendanceRate), fontSize: 7.5, alignment: 'right' },
        { text: String(row.submissions), fontSize: 7.5, alignment: 'center' },
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
      ])
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
        ],
      ];

  const curriculumBands: Band[] = [
    { label: 'Completed', count: snapshot.curriculum.completedWeeks, color: '#059669' },
    { label: 'In progress', count: snapshot.curriculum.inProgressWeeks, color: '#d97706' },
    { label: 'Skipped', count: snapshot.curriculum.skippedWeeks, color: '#e11d48' },
  ];
  const financeBands: Band[] = [
    { label: 'Paid', count: Math.max(0, Math.round(snapshot.finance.totalPaid)), color: '#059669' },
    {
      label: 'Outstanding',
      count: Math.max(0, Math.round(snapshot.finance.totalOutstanding)),
      color: '#b42318',
    },
  ].filter((band) => band.count > 0);

  const needsSupport = learners.filter(
    (row) => row.status === 'Needs support' || row.status === 'Attendance risk',
  ).length;
  const insights = snapshot.insights;
  const logoStack = logo
    ? [{ image: logo, width: 40, height: 40, margin: [0, 0, 0, 0] as [number, number, number, number] }]
    : [{ text: '', width: 40 }];

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 48],
    info: {
      title: report.title,
      author: brandContact.displayName,
      subject: 'School Performance Report',
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
                    text: 'School Performance Report',
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
              text: `${isPublished ? 'Published partner copy' : 'INTERNAL DRAFT — not for school release'} · ${brandContactLine(' · ')}`,
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
      // ── Official letterhead ──
      {
        columns: [
          {
            width: 56,
            stack: logoStack,
          },
          {
            width: '*',
            stack: [
              {
                text: brandContact.legalName,
                color: BRAND,
                bold: true,
                fontSize: 12,
                characterSpacing: 1,
              },
              {
                text: brandContact.tagline,
                color: MUTED,
                fontSize: 7.5,
                margin: [0, 1, 0, 2],
              },
              { text: brandContactLine('  ·  '), color: MUTED, fontSize: 6.5 },
              {
                text: brandContact.addressShort,
                color: MUTED,
                fontSize: 6.5,
                margin: [0, 1, 0, 0],
              },
            ],
          },
          {
            width: 120,
            stack: [
              {
                text: 'SCHOOL PERFORMANCE',
                alignment: 'right',
                bold: true,
                color: INK,
                fontSize: 8,
                characterSpacing: 0.8,
              },
              {
                text: 'REPORT BOOK',
                alignment: 'right',
                bold: true,
                color: BRAND,
                fontSize: 8,
                characterSpacing: 0.8,
                margin: [0, 1, 0, 6],
              },
              {
                table: {
                  body: [
                    [
                      {
                        text: isPublished ? 'PUBLISHED' : 'DRAFT',
                        color: '#ffffff',
                        bold: true,
                        fontSize: 7.5,
                        fillColor: isPublished ? '#067647' : BRAND,
                        alignment: 'center',
                        margin: [10, 4, 10, 4],
                      },
                    ],
                  ],
                },
                layout: 'noBorders',
                alignment: 'right',
              },
            ],
          },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 6],
      },
      brandAccentRule(),
      {
        text: report.title,
        color: INK,
        bold: true,
        fontSize: 17,
        lineHeight: 1.2,
        margin: [0, 0, 0, 4],
      },
      {
        text: `Prepared for ${snapshot.school.name}`,
        color: BRAND,
        bold: true,
        fontSize: 11,
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'ACADEMIC PERIOD', style: 'metaLabel' },
              {
                text: `${snapshot.period.termLabel} · ${snapshot.period.academicYear}`,
                style: 'metaValue',
              },
              { text: period, color: MUTED, fontSize: 8, margin: [0, 1, 0, 0] },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'CURRICULUM WINDOW', style: 'metaLabel' },
              { text: curriculumRange, style: 'metaValue' },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'SNAPSHOT', style: 'metaLabel' },
              {
                text: `Generated ${generatedLabel}`,
                style: 'metaValue',
              },
              {
                text: `Version ${snapshot.snapshotVersion || 1} · ${snapshot.summary.activeTeachers} assigned teachers`,
                color: MUTED,
                fontSize: 8,
                margin: [0, 1, 0, 0],
              },
            ],
          },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 14],
      },

      // ── At-a-glance (open metrics, not card clutter) ──
      {
        columns: [
          compactMetric(
            'Learners',
            String(snapshot.summary.activeStudents),
            `${snapshot.summary.studentsWithScores} with scores`,
            '#1d4ed8',
          ),
          compactMetric(
            'Avg score',
            fmtPct(snapshot.summary.averageScore),
            `${snapshot.summary.submissionsReceived} submissions`,
            '#059669',
          ),
          compactMetric(
            'Attendance',
            fmtPct(snapshot.summary.attendanceRate),
            'Present + late',
            '#0f766e',
          ),
          compactMetric(
            'Curriculum',
            fmtPct(snapshot.summary.curriculumCoverage),
            `${snapshot.curriculum.completedWeeks}/${snapshot.curriculum.plannedWeeks} weeks`,
            BRAND,
          ),
        ],
        columnGap: 14,
        margin: [0, 0, 0, 10],
      },
      {
        columns: [
          compactMetric(
            'Assigned staff',
            String(snapshot.summary.activeStaff),
            `${snapshot.summary.activeTeachers} teachers at this school`,
            '#0f766e',
          ),
          compactMetric(
            'Evidence quality',
            insights ? `${insights.evidenceQualityPct}%` : '—',
            'Learners with graded work',
            '#1d4ed8',
          ),
          compactMetric(
            'Class equity gap',
            insights ? `${insights.scoreEquityGap} pts` : '—',
            insights?.topClass && insights?.bottomClass
              ? `${insights.topClass.className} vs ${insights.bottomClass.className}`
              : 'Strongest vs weakest class',
            insights && insights.scoreEquityGap >= 20 ? '#b42318' : '#d97706',
          ),
          compactMetric(
            'At-risk learners',
            String(insights?.atRiskLearners ?? needsSupport),
            'Support or attendance risk',
            '#b42318',
          ),
        ],
        columnGap: 14,
        margin: [0, 0, 0, 12],
      },

      sectionTitle('Board briefing'),
      {
        text: insights?.headline || narrative.executiveSummary,
        fontSize: 9.5,
        color: INK,
        lineHeight: 1.35,
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Strengths', style: 'subsection', color: '#067647' },
              textList(insights?.strengths || narrative.achievements, '#067647'),
            ],
          },
          { width: 12, text: '' },
          {
            width: '*',
            stack: [
              { text: 'Risks', style: 'subsection', color: '#b42318' },
              textList(insights?.risks || narrative.concerns, '#b42318'),
            ],
          },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        stack: [
          { text: 'Priorities for this cycle', style: 'subsection' },
          textList(insights?.priorities || narrative.recommendations),
        ],
        margin: [0, 0, 0, 6],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Growth opportunities', style: 'subsection', color: BRAND },
              textList(insights?.growthAreas || []),
            ],
          },
          { width: 12, text: '' },
          {
            width: '*',
            stack: [
              { text: 'Areas to improve', style: 'subsection', color: '#b42318' },
              textList(insights?.improvementAreas || narrative.concerns, '#b42318'),
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },
      sectionTitle('Progressive next phase'),
      {
        text: 'A clear path so the school and every learner stay involved — not a one-off score sheet.',
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

      sectionTitle('Executive summary'),
      {
        text: narrative.executiveSummary,
        fontSize: 9,
        color: INK,
        lineHeight: 1.35,
        margin: [0, 0, 0, 8],
      },
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

      // ── Charts packed on same flow (no pageBreak) ──
      sectionTitle('Distributions & comparisons'),
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
      {
        columns: [
          {
            width: '*',
            ...pieChartBlock('Curriculum weeks', curriculumBands, {
              size: 92,
              emptyLabel: 'No curriculum weeks in range.',
            }),
          },
          {
            width: '*',
            ...pieChartBlock('Paid vs outstanding', financeBands, {
              size: 92,
              emptyLabel: 'No invoice amounts to chart.',
            }),
          },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 6],
      },
      barChartBlock(
        'Class average scores',
        snapshot.classPerformance.map((row) => ({
          label: row.className,
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

      // ── Curriculum + programmes continue on same pages ──
      sectionTitle('Curriculum & courses'),
      {
        text: `${snapshot.curriculum.completedWeeks} completed · ${snapshot.curriculum.inProgressWeeks} in progress · ${snapshot.curriculum.skippedWeeks} skipped · ${snapshot.curriculum.plannedWeeks} planned`,
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
          label: `${row.programme} — ${row.course}`,
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

      // ── Finance compact ──
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
            text: `Billing: ${brandContact.web} · School Billing · pay using the invoice number below.`,
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
        margin: [0, 0, 0, 8],
      },

      sectionTitle('Report completeness'),
      {
        text: snapshot.completeness?.readyToPublish
          ? `Ready to publish · completeness ${snapshot.completeness.score}%`
          : `Incomplete · ${snapshot.completeness?.completedRequired || 0}/${snapshot.completeness?.totalRequired || 0} required areas covered`,
        color: snapshot.completeness?.readyToPublish ? '#067647' : '#b42318',
        bold: true,
        fontSize: 8,
        margin: [0, 0, 0, 4],
      },
      {
        ul: (snapshot.completeness?.items || []).map(
          (item) =>
            `${item.ok ? '✓' : item.required ? '✗' : '○'} ${item.label}: ${item.detail}`,
        ),
        fontSize: 8,
        color: INK,
        margin: [0, 0, 0, 8],
      },

      // ── Learner roster (main detail ask) — natural page flow ──
      sectionTitle('Learner roster', learners.length > 25),
      {
        text: learners.length
          ? `${learners.length} active learners · ${needsSupport} flagged for support/attendance risk. Sorted by class, then name.`
          : 'Regenerate this report to attach the full child list to the book.',
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 4],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 78, 40, 42, 28, 68],
          body: [
            headerCells(['Learner', 'Grade / class', 'Score', 'Attend', 'Subs', 'Status']),
            ...learnerRows,
          ],
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 8],
      },

      // ── Findings packed tightly ──
      sectionTitle('Findings & next actions', false),
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Achievements', style: 'subsection' },
              textList(narrative.achievements, '#067647'),
              { text: 'Recommendations', style: 'subsection' },
              textList(narrative.recommendations),
            ],
          },
          { width: 10, text: '' },
          {
            width: '*',
            stack: [
              { text: 'Needs attention', style: 'subsection' },
              textList(narrative.concerns, '#b42318'),
              { text: 'Next-period focus', style: 'subsection' },
              textList(narrative.nextPeriodFocus),
            ],
          },
        ],
        margin: [0, 0, 0, 6],
      },
      { text: 'Data notes', style: 'subsection' },
      textList(snapshot.dataNotes, MUTED),
      {
        text: `Prepared by ${brandContact.displayName} · ${brandContact.web}. Figures are a frozen aggregate snapshot; staff approve wording before publication to the school.`,
        color: MUTED,
        fontSize: 7,
        margin: [0, 10, 0, 0],
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

export async function renderSchoolReportPdf(report: SchoolPerformanceReportRow): Promise<Buffer> {
  return renderPdfToBuffer(buildSchoolReportPdfDefinition(report));
}
