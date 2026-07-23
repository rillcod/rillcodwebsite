import fs from 'node:fs';
import path from 'node:path';
import { brandContact, brandContactLine } from '@/config/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeSchoolReportDesign, showReportSection, type SchoolReportSectionKey } from './design';
import { compareLearnersForRoster, resolveLearnerGradeForDisplay } from './aggregate';
import { resolveSchoolReportInsights } from './insights';
import { buildOfficialClosingRemark } from './closing-remark';
import { buildReportTopicsPresentation, buildTopicsCoveredDraft } from './delivered-topics';
import {
  buildTopicsCoveredPdfBodyForReport,
  buildCelebrationWallPdfStack,
  buildProgrammeSpotlightPdfStack,
  buildNextLinesPdfCallout,
  resolveLeadershipNarrativeForDisplay,
} from './topics-covered-presentation';
import {
  dedupeStringList,
  filterNextPhaseItems,
  NEXT_TERM_FOCUS_LABEL,
  resolveCommunityMessageForReport,
} from './report-content-dedup';
import { buildDeliveryLedger, type DeliveryLedger } from './delivery-structure';
import { loadSchoolReportPaymentAccounts, type SchoolReportPaymentAccount } from './payment-accounts';
import { DEFAULT_SCHOOL_REPORT_POLICY, schoolReportPhaseLabel, type SchoolReportPolicy } from './report-policy';
import { reconcileSchoolReportEnrolments } from './enrolment-counts';
import { renderPdfToBuffer } from '@/lib/pdfmake-server';
import { qrDataUrl } from '@/lib/cards/qr';
import { schoolReportVerificationCode, schoolReportVerificationUrl } from './verification';
import {
  buildGradebookSummarySheet,
} from './gradebook-detail';
import { buildStudentRecommendations } from './student-recommendations';
import {
  formatClassDisplay,
  formatCourseDisplay,
  formatProgrammeCourseDisplay,
  formatProgrammeDisplay,
  REPORT_METRIC_LABELS,
} from './display-labels';
import { mergeProgrammeCoursePerformanceWithEnrolment } from './programme-course-performance';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from './types';

/** Official school-report letterhead accent (aligned with Rillcod school materials). */
const BRAND = '#7a0606';
const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#d1d5db';
const BORDER = '#e5e7eb';
const HEADER_BG = '#1f2937';
const PAGE_WIDTH_CONTENT = 515;
const PDF_MIN_SECTION = 68;
const PDF_MIN_PANEL = 132;
const PDF_MIN_TABLE = 108;
const PDF_MIN_CHART = 148;
const PDF_MIN_APPENDIX = 228;
const APPENDIX_A_ACCENT = BRAND;
const APPENDIX_C_ACCENT = '#0f766e';
const APPENDIX_B_ACCENT = '#1e3a5f';
const APPENDIX_D_ACCENT = '#065f46';
const APPENDIX_ROSTER_TINT = '#f3f4f6';
const APPENDIX_GRADEBOOK_TINT = '#f3f4f6';
const PRINT_BORDER = '#374151';
const PRINT_BORDER_LIGHT = '#9ca3af';
const PRINT_GROUP_BAR = '#4b5563';

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

/** Trim at word boundaries — avoids harsh mid-word cuts in PDF cells. */
function smartTruncateWords(text: string, maxChars: number): string {
  const trimmed = cleanDisplayText(text);
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.55) return `${slice.slice(0, lastSpace).trimEnd()}…`;
  return `${slice.trimEnd()}…`;
}

function wrapPdfText(
  value: unknown,
  opts?: {
    fontSize?: number;
    bold?: boolean;
    color?: string;
    align?: 'left' | 'right' | 'center';
    lineHeight?: number;
    maxChars?: number;
    italics?: boolean;
  },
) {
  let text = cleanDisplayText(value);
  if (opts?.maxChars) text = smartTruncateWords(text, opts.maxChars);
  return {
    text,
    fontSize: opts?.fontSize ?? 7.5,
    bold: opts?.bold,
    color: opts?.color ?? INK,
    alignment: opts?.align ?? ('left' as const),
    lineHeight: opts?.lineHeight ?? 1.25,
    ...(opts?.italics ? { italics: true } : {}),
  };
}

function formatProgrammeScopeText(items: string[]): string {
  const labels = items.map((item) => cleanDisplayText(item)).filter(Boolean);
  if (!labels.length) return '';
  const inline = labels.join('   |   ');
  return inline.length > 96 ? labels.join('\n') : inline;
}

function classListPdfCell(classNames: string[]) {
  const labels = classNames.map((name) => formatClassDisplay(name)).filter(Boolean);
  if (!labels.length) return wrapPdfText('-', { color: MUTED, fontSize: 7.25 });
  if (labels.length <= 4) {
    return {
      stack: labels.map((label) => wrapPdfText(label, { fontSize: 7.25, lineHeight: 1.2 })),
    };
  }
  return {
    stack: [
      ...labels.slice(0, 4).map((label) => wrapPdfText(label, { fontSize: 7.25, lineHeight: 1.2 })),
      wrapPdfText(`+${labels.length - 4} more`, { fontSize: 6.75, color: MUTED, italics: true, lineHeight: 1.1 }),
    ],
  };
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

function loadOfficialSignatureDataUrl(asset = '/images/signature.png'): string | null {
  const relative = String(asset || '').replace(/^\/+/, '').replace(/\.\.[/\\]/g, '');
  return loadPngDataUrl([
    path.join(process.cwd(), 'public', relative),
    path.join(process.cwd(), 'public', 'images', 'signature.png'),
  ]);
}

const textList = (items: string[], color = INK) =>
  items.length
    ? { ul: items, color, fontSize: 9, lineHeight: 1.35, margin: [0, 2, 0, 6] }
    : { text: 'No items recorded.', color: MUTED, italics: true, fontSize: 8, margin: [0, 2, 0, 6] };

const briefLearnerLine = (value: string) => {
  const text = String(value || '').trim();
  const match = text.match(/^(.+?):\s*(\d+(?:\.\d+)?%)/);
  return match ? `${match[1]}: ${match[2]} term average` : smartTruncateWords(text, 160);
};

const briefExecutiveItems = (items: string[], maxItems = 4, maxChars = 160) =>
  items.slice(0, maxItems).map((value) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text;
    return smartTruncateWords(firstSentence, maxChars);
  });

const formatMoney = (value: number, currency: string, locale = 'en-NG') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const plainStatus = (value: string) =>
  String(value || 'pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function toTitleCase(value: string): string {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function withMinPresence(node: object, minPresenceAhead = PDF_MIN_PANEL): object {
  return { ...node, minPresenceAhead };
}

/** Table that can flow across pages but won't start unless the header fits comfortably. */
function flowingDataTable(
  headers: string[],
  rows: object[][],
  widths: (string | number)[],
  opts?: { compact?: boolean; layout?: ReturnType<typeof tableLayout>; margin?: [number, number, number, number] },
) {
  const body = rows.length
    ? [headerCells(headers), ...rows]
    : [[{ text: 'No records for this section.', colSpan: headers.length, color: MUTED, italics: true, fontSize: 8 }, ...Array(Math.max(0, headers.length - 1)).fill({})]];
  return withMinPresence(
    {
      table: {
        headerRows: 1,
        dontBreakRows: opts?.compact ?? false,
        widths,
        body,
      },
      layout: opts?.layout ?? tableLayout(),
      margin: opts?.margin ?? ([0, 0, 0, 8] as [number, number, number, number]),
    },
    opts?.compact ? 84 : PDF_MIN_TABLE,
  );
}

function appendixSectionStack(hero: object, table: object, pageBreak = false) {
  return withMinPresence(
    {
      stack: [hero, table],
      ...(pageBreak ? { pageBreak: 'before' as const } : {}),
    },
    PDF_MIN_APPENDIX,
  );
}

function formatSchoolDisplayName(name: unknown): string {
  return cleanDisplayText(name) || 'Partner school';
}

function formatTermPeriod(snapshot: SchoolPerformanceReportRow['snapshot']): string {
  return `${snapshot.period.termLabel}, ${snapshot.period.academicYear}`;
}

function metaCaption(text: string, color = MUTED) {
  return {
    text: toTitleCase(text),
    style: 'metaLabel' as const,
    color,
  };
}

const fmtPct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? '-' : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;

type GroupedLearnerRow = SchoolReportSnapshot['learners'][number];

/** Class-grouped PDF table rows shared by Appendix A roster and Appendix C assignment gradebook. */
function buildGroupedLearnerTableRows(
  rows: GroupedLearnerRow[],
  colSpan: number,
  buildRow: (row: GroupedLearnerRow, labels: ReturnType<typeof resolveLearnerGradeForDisplay>) => object[],
  _groupAccent = BRAND,
): object[][] {
  if (!rows.length) return [];
  return rows.flatMap((row, index) => {
    const labels = resolveLearnerGradeForDisplay(row);
    const previousLabels = index > 0 ? resolveLearnerGradeForDisplay(rows[index - 1]) : null;
    const groupKey = `${labels.gradeLabel}|${labels.classLabel}`;
    const previousGroupKey = previousLabels ? `${previousLabels.gradeLabel}|${previousLabels.classLabel}` : '';
    const dataRow = buildRow(row, labels);
    if (groupKey === previousGroupKey) return [dataRow];
    const filler = Array.from({ length: colSpan - 1 }, () => ({}));
    return [
      [
        {
          text: `${labels.gradeLabel}  ·  ${cleanDisplayText(labels.classLabel)}`,
          colSpan,
          bold: true,
          color: '#ffffff',
          fillColor: PRINT_GROUP_BAR,
          fontSize: 8,
          characterSpacing: 0.35,
          margin: [8, 6, 8, 6],
        },
        ...filler,
      ],
      dataRow,
    ];
  });
}

function appendixStatChip(label: string, value: string, _color = BRAND) {
  return {
    width: 'auto' as const,
    table: {
      widths: [76],
      body: [
        [{ text: value, fontSize: 13, bold: true, color: INK, alignment: 'center' as const, margin: [0, 5, 0, 1] as [number, number, number, number] }],
        [{ text: toTitleCase(label), fontSize: 6.5, color: MUTED, alignment: 'center' as const, margin: [0, 0, 0, 5] as [number, number, number, number] }],
      ],
    },
    layout: {
      fillColor: () => '#ffffff',
      hLineColor: () => PRINT_BORDER,
      vLineColor: () => PRINT_BORDER,
      hLineWidth: (rowIndex: number) => (rowIndex === 0 ? 1.5 : 0.75),
      vLineWidth: () => 0.75,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 8, 0] as [number, number, number, number],
  };
}

function appendixHero(opts: {
  letter: string;
  title: string;
  subtitle: string;
  accent?: string;
  chips: Array<{ label: string; value: string; color?: string }>;
  pageBreak?: boolean;
  showDetachNote?: boolean;
}) {
  const accent = opts.accent || BRAND;
  return {
    stack: [
      {
        table: {
          widths: [56, '*'],
          body: [[
            {
              stack: [
                { text: 'Appendix', fontSize: 6, color: '#ffffff', alignment: 'center' as const, margin: [0, 0, 0, 1] as [number, number, number, number] },
                { text: opts.letter, fontSize: 28, bold: true, color: '#ffffff', alignment: 'center' as const, margin: [0, -2, 0, 0] as [number, number, number, number] },
              ],
              fillColor: accent,
              margin: [0, 8, 0, 8] as [number, number, number, number],
            },
            {
              stack: [
                { text: toTitleCase(opts.title), fontSize: 14, bold: true, color: INK, margin: [0, 0, 0, 4] as [number, number, number, number] },
                { text: opts.subtitle, fontSize: 8.25, color: MUTED, lineHeight: 1.4, margin: [0, 0, 0, 8] as [number, number, number, number] },
                { columns: opts.chips.map((chip) => appendixStatChip(chip.label, chip.value, chip.color || accent)) },
              ],
              fillColor: '#ffffff',
              margin: [12, 10, 12, 10] as [number, number, number, number],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => PRINT_BORDER,
          vLineColor: () => PRINT_BORDER,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      ...(opts.showDetachNote
        ? [{
            text: 'This page may be detached from the main report book for filing or school records.',
            color: MUTED,
            fontSize: 6.75,
            italics: true,
            margin: [0, 0, 0, 6] as [number, number, number, number],
          }]
        : []),
    ],
    ...(opts.pageBreak ? { pageBreak: 'before' as const } : {}),
  };
}

function appendixHeaderCells(labels: string[]) {
  return labels.map((text) => ({
    text: toTitleCase(text),
    bold: true,
    fontSize: 7,
    color: '#ffffff',
    fillColor: HEADER_BG,
    margin: [0, 7, 0, 7] as [number, number, number, number],
  }));
}

function appendixTableLayout(stripeTint = APPENDIX_ROSTER_TINT) {
  return {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? HEADER_BG : rowIndex % 2 ? '#ffffff' : stripeTint),
    hLineWidth: () => 0.75,
    vLineWidth: () => 0.75,
    hLineColor: () => PRINT_BORDER_LIGHT,
    vLineColor: () => PRINT_BORDER_LIGHT,
    paddingLeft: () => 7,
    paddingRight: () => 7,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  };
}

function scorePctCell(value: number | null | undefined, bold = false) {
  if (value == null || !Number.isFinite(Number(value))) {
    return { text: '—', fontSize: 7.5, alignment: 'right' as const, color: MUTED };
  }
  return {
    text: fmtPct(Number(value)),
    fontSize: bold ? 8.25 : 7.5,
    alignment: 'right' as const,
    bold,
    color: INK,
  };
}

function statusBadgeCell(status: GroupedLearnerRow['status']) {
  return {
    text: toTitleCase(status),
    fontSize: 6,
    bold: true,
    color: INK,
    fillColor: '#ffffff',
    alignment: 'center' as const,
    border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
    borderColor: [PRINT_BORDER_LIGHT, PRINT_BORDER_LIGHT, PRINT_BORDER_LIGHT, PRINT_BORDER_LIGHT] as [string, string, string, string],
    margin: [2, 3, 2, 3] as [number, number, number, number],
  };
}


function datasheetTextCell(text: string, opts?: { bold?: boolean; align?: 'left' | 'right' | 'center'; muted?: boolean }) {
  return wrapPdfText(text, {
    fontSize: 7.5,
    bold: opts?.bold,
    color: opts?.muted ? MUTED : INK,
    align: opts?.align || 'left',
    lineHeight: 1.25,
  });
}

function buildAppendixCSummaryRows(learners: GroupedLearnerRow[]): object[][] {
  const sorted = [...learners].sort(compareLearnersForRoster);
  const summary = buildGradebookSummarySheet(sorted);

  return sorted.length
    ? buildGroupedLearnerTableRows(sorted, 4, (row) => {
        const rowSummary = summary.find((item) => item.learnerId === row.id);
        return [
          datasheetTextCell(row.name, { bold: true }),
          scorePctCell(rowSummary?.classworkScore ?? null),
          scorePctCell(rowSummary?.assignmentAverage ?? null, true),
          scorePctCell(rowSummary?.assessmentScore ?? null),
        ];
      }, APPENDIX_C_ACCENT)
    : [[
        { text: 'No learner records are included in this report.', colSpan: 4, color: MUTED, italics: true, fontSize: 8 },
        {}, {}, {},
      ]];
}

function printableAppendixTable(body: object[][], widths: (string | number)[], stripeTint = APPENDIX_ROSTER_TINT) {
  return withMinPresence(
    {
      table: {
        headerRows: 1,
        dontBreakRows: false,
        widths,
        body,
      },
      layout: appendixTableLayout(stripeTint),
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    92,
  );
}

/** Open metric cell - no filled cards; keeps the page calm and official. */
function compactMetric(label: string, value: string, note: string, color = BRAND) {
  return {
    stack: [
      { text: toTitleCase(label), color: MUTED, fontSize: 6.5, bold: true },
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
    paddingLeft: () => 7,
    paddingRight: () => 7,
    paddingTop: () => 6,
    paddingBottom: () => 6,
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
function borderedSegment(title: string, body: object[], accent = BRAND, fillColor = '#fafafa') {
  return withMinPresence(
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [{ text: toTitleCase(title), style: 'subsection', color: accent, margin: [0, 0, 0, 5] }, ...body],
              fillColor,
              margin: [10, 8, 10, 10],
            },
          ],
        ],
      },
      layout: panelBorderLayout(accent),
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    PDF_MIN_PANEL,
  );
}

/** Side-by-side segment columns with equal weight and breathing room. */
function pairedSegmentColumns(left: object, right: object, gap = 14) {
  return withMinPresence(
    {
      columns: [
        { width: '*', ...left },
        { width: gap, text: '' },
        { width: '*', ...right },
      ],
      columnGap: 0,
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    PDF_MIN_PANEL + 24,
  );
}

function numberedRecommendationCards(items: string[], maxItems = 4) {
  const recommendations = briefExecutiveItems(items, maxItems, 150);
  if (!recommendations.length) {
    return { text: 'No student recommendations recorded.', color: MUTED, italics: true, fontSize: 8 };
  }
  return withMinPresence(
    {
      table: {
        widths: [30, '*'],
        body: recommendations.map((item, index) => [
          {
            text: String(index + 1).padStart(2, '0'),
            color: '#ffffff',
            fillColor: BRAND,
            bold: true,
            fontSize: 10,
            alignment: 'center',
            margin: [0, 7, 0, 7],
          },
          {
            text: item,
            color: INK,
            fillColor: index % 2 === 0 ? '#f9fafb' : '#fff7f7',
            fontSize: 8.5,
            lineHeight: 1.3,
            margin: [9, 6, 8, 6],
          },
        ]),
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    },
    PDF_MIN_TABLE,
  );
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

function paymentAccountsBlock(accounts: SchoolReportPaymentAccount[], policy: SchoolReportPolicy) {
  if (!accounts.length) {
    return {
      stack: [
        { text: 'Payment instructions', style: 'subsection' },
        {
          text: `Bank transfer details are not included here. Please contact ${policy.payment.whatsappDisplay} and quote your invoice number.`,
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
        text: `Quote your invoice number as the payment reference. Use the account below, then send the receipt by WhatsApp to the official line: ${policy.payment.whatsappDisplay}.`,
        color: MUTED,
        fontSize: 7.5,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        table: {
          widths: ['*'],
          body: accounts.slice(0, 1).map((acct) => [
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

  return withMinPresence(
    {
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
    },
    PDF_MIN_CHART,
  );
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

  const valueWidth = 36;
  const gapWidth = 6;
  const labelWidth = 188;
  const chartWidth = PAGE_WIDTH_CONTENT - labelWidth - valueWidth - gapWidth;
  const barHeight = 8;
  const max = Math.max(...items.map((row) => row.value), 1);

  const bars = items.map((row) => {
    const width = Math.max(3, Math.round((Math.max(0, row.value) / max) * chartWidth));
    return {
      columns: [
        {
          width: labelWidth,
          stack: [
            {
              text: row.label,
              fontSize: 7,
              color: INK,
              lineHeight: 1.2,
            },
          ],
          margin: [0, 1, 6, 0],
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
          margin: [gapWidth, 1, 0, 0],
        },
      ],
      margin: [0, 0, 0, 4],
    };
  });

  return withMinPresence(
    {
      stack: [{ text: title, style: 'subsection', margin: [0, 0, 0, 4] }, ...bars],
    },
    PDF_MIN_CHART,
  );
}

function scoreColor(score: number) {
  if (score >= 75) return '#059669';
  if (score >= 50) return '#d97706';
  return '#e11d48';
}

function sectionTitle(text: string, withBreak = false) {
  return withMinPresence(
    {
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
    },
    withBreak ? PDF_MIN_TABLE : PDF_MIN_SECTION,
  );
}

function buildTopicsPresentation(
  snapshot: SchoolPerformanceReportRow['snapshot'],
): ReturnType<typeof buildReportTopicsPresentation> {
  return buildReportTopicsPresentation(snapshot);
}

function topicsCoveredText(
  narrative: SchoolPerformanceReportRow['narrative'],
  insights: ReturnType<typeof resolveSchoolReportInsights> | undefined,
  snapshot: SchoolPerformanceReportRow['snapshot'],
): string {
  const presentation = buildTopicsPresentation(snapshot);
  const fallbackDraft = buildTopicsCoveredDraft(snapshot);
  const leadershipNarrative = resolveLeadershipNarrativeForDisplay(
    narrative.topicsCovered,
    presentation,
    { fallbackDraft },
  );
  if (leadershipNarrative) return leadershipNarrative;
  if (presentation?.plainText) return presentation.plainText;
  if (insights?.topicsProseSeed) return insights.topicsProseSeed;
  if (fallbackDraft.trim()) return fallbackDraft;
  if (insights?.academicCoverage?.length) return insights.academicCoverage.slice(0, 3).join(' ');
  return '';
}

function reportTermLabel(snapshot: SchoolPerformanceReportRow['snapshot']): string {
  return snapshot.period?.termLabel || 'this term';
}

function topicsCoveredPdfBody(
  narrative: SchoolPerformanceReportRow['narrative'],
  snapshot: SchoolPerformanceReportRow['snapshot'],
  colors: { ink: string; brand: string; muted: string },
  nextLines?: string[],
): object[] {
  const presentation = buildTopicsPresentation(snapshot);
  const enrolledCourseLabels = (snapshot.schoolProgrammes || [])
    .filter((row) => (row.enrolledStudents ?? 0) > 0)
    .map((row) => `${formatProgrammeDisplay(row.programme)} · ${formatCourseDisplay(row.course)}`);

  return buildTopicsCoveredPdfBodyForReport(narrative, presentation, colors, {
    enrolledCourseLabels,
    fallbackDraft: buildTopicsCoveredDraft(snapshot),
    nextLines,
  });
}

export function buildSchoolReportPdfDefinition(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative']; verificationQrDataUrl?: string },
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
  const programmeCourseRows = mergeProgrammeCoursePerformanceWithEnrolment(
    snapshot.programmeCoursePerformance || [],
    snapshot.schoolProgrammes || [],
  );
  const reportPolicy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const verificationCode = report.verification_code || schoolReportVerificationCode(report.id);
  const verificationUrl = schoolReportVerificationUrl(report.id);
  const narrative = opts?.narrative || report.narrative;
  const design = normalizeSchoolReportDesign(report.design);
  const BRAND = design.accentColor;
  const showSec = (key: SchoolReportSectionKey) => showReportSection(design, key);
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const sortedLearners = [...learners].sort(compareLearnersForRoster);
  const attendanceSourceNote = `${snapshot.summary.activeStudents} learner${snapshot.summary.activeStudents === 1 ? '' : 's'} with attendance records this term`;
  const overallTopScorer = [...learners]
    .filter((learner) => Number.isFinite(Number(learner.averageScore)) && Number(learner.averageScore) > 0)
    .sort((a, b) => Number(b.averageScore) - Number(a.averageScore) || a.name.localeCompare(b.name))[0] || null;
  const logo = design.showLogo ? loadBrandLogoDataUrl() : null;
  const issuedAt = new Date(snapshot.generatedAt || report.updated_at || Date.now());
  const signatoryActive =
    (!reportPolicy.signatory.activeFrom || issuedAt >= new Date(reportPolicy.signatory.activeFrom)) &&
    (!reportPolicy.signatory.activeUntil || issuedAt <= new Date(reportPolicy.signatory.activeUntil));
  const officialSignature = signatoryActive
    ? loadOfficialSignatureDataUrl(reportPolicy.signatory.signatureAsset)
    : null;
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
        wrapPdfText(formatClassDisplay(row.className), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(row.teacherName || '-', { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
        { text: String(row.students), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.averageScore), fontSize: 8, alignment: 'right', bold: true },
        { text: fmtPct(row.attendanceRate), fontSize: 8, alignment: 'right' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
      ])
    : [[{ text: 'No class data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  const staffTeachers = Array.isArray(snapshot.staff?.teachers) ? snapshot.staff.teachers : [];
  const staffRows = staffTeachers.length
    ? staffTeachers.map((row) => [
        wrapPdfText(row.name, { fontSize: 8, bold: true, lineHeight: 1.2 }),
        wrapPdfText(
          row.source === 'both'
            ? 'Assigned + class owner'
            : row.source === 'teacher_schools'
              ? 'School assignment'
              : 'Class owner',
          { fontSize: 7.5, color: MUTED, lineHeight: 1.2 },
        ),
        { text: String(row.classCount), fontSize: 8, alignment: 'center' },
        classListPdfCell(row.classNames),
      ])
    : [[{ text: 'No teachers assigned to this school', colSpan: 4, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}]];

  const curriculumRows = snapshot.curriculum.courses.length
    ? snapshot.curriculum.courses.map((row) => [
        wrapPdfText(formatCourseDisplay(row.course), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
        { text: `${row.completed}/${row.planned}`, fontSize: 8, alignment: 'center' },
        { text: String(row.inProgress), fontSize: 8, alignment: 'center' },
        { text: String(row.skipped), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No curriculum data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  const programmeRows = programmeCourseRows.length
    ? programmeCourseRows.map((row) => [
        wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(formatCourseDisplay(row.course), { fontSize: 8, lineHeight: 1.2 }),
        { text: String(row.enrolledStudents || row.students), fontSize: 8, alignment: 'center' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
        {
          text: row.submissions > 0 ? fmtPct(row.averageScore) : '—',
          fontSize: 8,
          alignment: 'right',
          bold: true,
        },
      ])
    : [[{ text: 'No programme/course outcomes recorded', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const { programmeEnrolments: cumulativeProgrammeEnrolments, totalStudents: uniqueLearners } =
    reconcileSchoolReportEnrolments({
      schoolProgrammes: snapshot.schoolProgrammes,
      programmeCoursePerformance: snapshot.programmeCoursePerformance,
      learnerIds: sortedLearners.map((learner) => learner.id),
      activeStudents: snapshot.summary.activeStudents,
    });

  const invoiceRows = snapshot.finance.invoices.length
    ? snapshot.finance.invoices.map((invoice) => [
        { text: invoice.invoiceNumber, fontSize: 8 },
        { text: plainStatus(invoice.status), fontSize: 7.5 },
        { text: formatMoney(invoice.amount, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 8, alignment: 'right' },
        { text: formatMoney(invoice.paid, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 8, alignment: 'right' },
        { text: formatMoney(invoice.outstanding, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'Invoice for this term will be issued separately.', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const learnersWithAssignmentEvidence = sortedLearners.filter(
    (row) =>
      row.gradebook?.fromPublishedReport
      || row.gradebook?.classworkScore != null
      || row.gradebook?.assignmentAverage != null
      || row.gradebook?.assessmentScore != null,
  ).length;
  const rosterAssessedCount = sortedLearners.filter((row) => row.gradebook?.examScore != null || row.averageScore != null).length;
  const rosterExcellentCount = sortedLearners.filter((row) => row.status === 'Excellent').length;

  const learnerRows = sortedLearners.length
    ? buildGroupedLearnerTableRows(sortedLearners, 8, (row, labels) => {
        const gradebook = row.gradebook;
        const examScore = gradebook?.examScore ?? row.averageScore;
        return [
          { text: row.name, fontSize: 8, bold: true, color: INK },
          { text: labels.gradeLabel, fontSize: 7.5, bold: true, color: INK },
          { text: cleanDisplayText(labels.classLabel), fontSize: 7, color: MUTED },
          scorePctCell(gradebook?.theoryScore),
          scorePctCell(gradebook?.practicalScore),
          scorePctCell(examScore, true),
          scorePctCell(row.attendanceRate),
          statusBadgeCell(row.status),
        ];
      }, APPENDIX_A_ACCENT)
    : [
        [
          {
            text: 'Learner roster is not included in this report.',
            colSpan: 8,
            color: MUTED,
            italics: true,
            fontSize: 8,
          },
          {}, {}, {}, {}, {}, {}, {},
        ],
      ];

  const appendixCSummaryRows = buildAppendixCSummaryRows(sortedLearners);

  const hasStaffDelivery = Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const curriculumBands: Band[] = [
    { label: 'Completed', count: snapshot.curriculum.completedWeeks, color: '#059669' },
    { label: 'In progress', count: snapshot.curriculum.inProgressWeeks, color: '#d97706' },
    ...(hasStaffDelivery || snapshot.curriculum.skippedWeeks <= 0
      ? []
      : [{ label: 'Skipped', count: snapshot.curriculum.skippedWeeks, color: '#e11d48' }]),
  ];
  const programmeCoverageMap = new Map<string, { completed: number; planned: number }>();
  for (const row of programmeCourseRows) {
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
  const topicsPresentation = buildTopicsPresentation(snapshot);
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
      line.includes('Term delivery confirmed across') || line.includes('Term delivery pacing depth')
        ? line.replace(/\(\d+% pacing depth\)/, `(${reliableCoverage}% pacing depth)`)
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
  const showWhatWeTaught =
    Boolean(topicsText) ||
    Boolean(topicsPresentation) ||
    Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const showDelivery =
    showSec('deliverySummary') ||
    Boolean(topicsText) ||
    Boolean(topicsPresentation) ||
    Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const leadershipNarrativeText = resolveLeadershipNarrativeForDisplay(
    narrative.topicsCovered,
    topicsPresentation,
    { fallbackDraft: buildTopicsCoveredDraft(snapshot) },
  );
  const briefingCorpus = [
    narrative.executiveSummary,
    leadershipNarrativeText,
    ...deliveryLedger.nextLines,
  ].filter(Boolean);
  const pdfStrengthItems = dedupeStringList(
    briefExecutiveItems(narrative.achievements.length ? narrative.achievements : insights?.strengths || [], 3, 115),
    briefingCorpus,
    3,
  );
  const pdfFocusItems = dedupeStringList(
    briefExecutiveItems(insights?.partnershipFocus?.length ? insights.partnershipFocus : narrative.concerns || [], 3, 125),
    [...briefingCorpus, ...pdfStrengthItems],
    3,
  );
  const nextPhaseCorpus = [
    ...briefingCorpus,
    ...pdfStrengthItems,
    ...pdfFocusItems,
    ...(narrative.nextPeriodFocus || []),
  ];
  const filteredNextPhaseSchool = (insights?.nextPhaseSchool || [])
    .map((phase) => ({
      ...phase,
      actions: filterNextPhaseItems(phase.actions, nextPhaseCorpus),
    }))
    .filter((phase) => phase.actions.length > 0);
  const filteredInvolvement = filterNextPhaseItems(insights?.involvement || [], nextPhaseCorpus);
  const showNextPhaseSection =
    showSec('nextPhase') &&
    (filteredNextPhaseSchool.length > 0 ||
      filteredInvolvement.length > 0 ||
      (insights?.nextPhaseLearners?.length || 0) > 0);
  const learningPhase = schoolReportPhaseLabel(reportPolicy, snapshot.period.academicTermNumber || snapshot.period.curriculumStart.term || 1);
  const programmesInScope = Array.from(
    new Set(
      [
        ...deliveryLedger.topicRows.map((row) => row.programme),
        ...snapshot.programmeCoursePerformance.map((row) => row.programme),
        ...(snapshot.schoolProgrammes || []).map((row) => row.programme),
      ].filter(Boolean),
    ),
  );
  const programmeScopeText = formatProgrammeScopeText(programmesInScope);
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
              text: `${isPublished ? 'Official school report' : 'Draft copy — for review before release'}  |  ${brandContactLine('  |  ')}`,
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
        table: {
          widths: [58, '*'],
          body: [[
            {
              stack: logoStack,
              border: [false, false, false, false],
              margin: [0, 1, 0, 1],
            },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { text: brandContact.legalName, color: BRAND, bold: true, fontSize: 13, characterSpacing: 1 },
                    { text: brandContact.tagline, color: INK, fontSize: 7.5, margin: [0, 2, 0, 3] },
                    { text: brandContact.addressShort, color: MUTED, fontSize: 6.5 },
                  ],
                },
                {
                  width: 210,
                  stack: [
                    { text: brandContactLine('   |   '), color: MUTED, fontSize: 6.5, alignment: 'right' },
                    { text: 'STEM, ROBOTICS & AI EDUCATION PARTNER', color: BRAND, bold: true, fontSize: 6.5, alignment: 'right', margin: [0, 5, 0, 0] },
                  ],
                },
              ],
              border: [false, false, false, false],
              margin: [0, 2, 0, 0],
            },
          ]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: ['*', 176],
          body: [[
            {
              stack: [
                { text: 'School performance and curriculum report', color: '#ffffff', bold: true, fontSize: 12 },
              ],
              fillColor: HEADER_BG,
              margin: [14, 11, 12, 10],
            },
            {
              stack: [
                { text: 'Partner school', color: '#fecaca', bold: true, fontSize: 6.5, alignment: 'right' },
                { text: formatSchoolDisplayName(snapshot.school.name), color: '#ffffff', bold: true, fontSize: 8.25, alignment: 'right', margin: [0, 3, 0, 0] },
                { text: isPublished ? 'Published revision' : 'Draft preview', color: isPublished ? '#86efac' : '#fca5a5', bold: true, fontSize: 6.25, alignment: 'right', margin: [0, 4, 0, 0] },
              ],
              fillColor: '#111827',
              margin: [10, 9, 12, 9],
            },
          ]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 0],
      },
      brandAccentRule(),

      // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Period & snapshot meta (single panel) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
      {
        table: {
          widths: ['*', 172],
          body: [[
            {
              stack: [
                { text: 'ACADEMIC PERIOD', style: 'metaLabel' },
                { text: `${snapshot.period.termLabel}  |  ${snapshot.period.academicYear}`, style: 'metaValue', fontSize: 10, bold: true, color: INK },
                { text: period, color: MUTED, fontSize: 7.5, margin: [0, 3, 0, 0] },
                {
                  columns: [
                    { text: snapshot.curriculum.courses.length > 1 ? 'Course-specific delivery windows' : `Term ${snapshot.period.curriculumStart.term}, Weeks ${snapshot.period.curriculumStart.week}-${snapshot.period.curriculumEnd.week}`, color: MUTED, fontSize: 7, margin: [0, 4, 0, 0] },
                    { text: `${toTitleCase(learningPhase)} phase`, color: BRAND, bold: true, fontSize: 7, alignment: 'right', margin: [0, 4, 0, 0] },
                  ],
                },
              ],
            },
            {
              stack: [
                { text: 'GENERATED', style: 'metaLabel' },
                { text: generatedLabel, style: 'metaValue', fontSize: 9, bold: true },
                { text: isPublished ? 'Published revision on file' : 'Draft — verify before sharing', color: MUTED, fontSize: 7.25, margin: [0, 3, 0, 0] },
                { text: `${snapshot.summary.activeTeachers} teachers  |  ${snapshot.summary.activeStaff} staff`, color: MUTED, fontSize: 7.25, margin: [0, 2, 0, 0] },
              ],
            },
          ]],
        },
        layout: borderedPanelLayout('#f8fafc'),
        margin: [0, 0, 0, 12],
      },
      // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Key metrics (one row - no duplicate blocks) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
      withMinPresence(
        {
          unbreakable: true,
          columns: [
          compactMetric(
            'Enrolments  |  Students',
            `${cumulativeProgrammeEnrolments || uniqueLearners}  |  ${uniqueLearners}`,
            'Course placements  |  unique learners',
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
            attendanceSourceNote,
            '#0f766e',
          ),
          compactMetric(
            'Curriculum coverage',
            fmtPct(snapshot.summary.curriculumCoverage),
            `${snapshot.curriculum.completedWeeks} of ${snapshot.curriculum.plannedWeeks} modules delivered`,
            BRAND,
          ),
          compactMetric(
            'Term invoice',
            snapshot.finance.attached
              ? formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale)
              : 'Not linked',
            snapshot.finance.attached
              ? `${snapshot.finance.invoiceCount} invoice(s) on file`
              : 'Pending invoice',
            snapshot.finance.attached ? '#2563eb' : '#b42318',
          ),
        ],
        columnGap: 10,
        margin: [0, 0, 0, 10],
        },
        PDF_MIN_PANEL,
      ),

      ...(showDelivery
        ? [
            ...(programmeScopeText
              ? [
                  withMinPresence(
                    {
                      table: {
                        widths: [118, '*'],
                        body: [[
                          {
                            text: 'PROGRAMMES IN SCOPE',
                            color: '#ffffff',
                            bold: true,
                            fontSize: 7.25,
                            characterSpacing: 0.55,
                            fillColor: BRAND,
                            margin: [10, 7, 8, 7],
                          },
                          {
                            text: programmeScopeText,
                            color: INK,
                            bold: true,
                            fontSize: 8.75,
                            lineHeight: 1.25,
                            fillColor: '#fef2f2',
                            margin: [10, 7, 8, 7],
                          },
                        ]],
                      },
                      layout: 'noBorders',
                      margin: [0, 0, 0, 9],
                    },
                    PDF_MIN_SECTION,
                  ),
                ]
              : []),            ...(showWhatWeTaught
              ? [
                  borderedSegment('What we taught', topicsCoveredPdfBody(narrative, snapshot, {
                    ink: INK,
                    brand: BRAND,
                    muted: MUTED,
                  }, deliveryLedger.nextLines), BRAND),
                ]
              : []),
            ...(deliveryLedger.topicRows.length
              ? [
                  borderedSegment(
                    'Curriculum delivery',
                    [
                      flowingDataTable(
                        ['Programme', 'Course', 'Delivery range', 'Evidence & next step'],
                        deliveryLedger.topicRows.map((row) => {
                          const reflection = programmeReflectionByKey.get(`${row.programme}::${row.course}`);
                          return [
                            {
                              stack: [
                                wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 7.5, bold: true, lineHeight: 1.2 }),
                                wrapPdfText(`${schoolReportPhaseLabel(reportPolicy, snapshot.period.academicTermNumber || snapshot.period.curriculumStart.term || 1, row.programme)} phase`, { fontSize: 6.5, color: BRAND, lineHeight: 1.15 }),
                              ],
                            },
                            wrapPdfText(formatCourseDisplay(row.course), { fontSize: 7.5, lineHeight: 1.2 }),
                            wrapPdfText(row.weekRange, { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
                            {
                              stack: [
                                wrapPdfText(row.evidence, { fontSize: 7.25, color: MUTED, lineHeight: 1.25 }),
                                ...(reflection?.nextIntro
                                  ? [wrapPdfText(reflection.nextIntro, { fontSize: 7.25, color: INK, lineHeight: 1.25, maxChars: 220 })]
                                  : []),
                              ],
                            },
                          ];
                        }),
                        ['24%', '24%', '18%', '*'],
                      ),
                      ...(deliveryLedger.pathNote
                        ? [{
                            text: deliveryLedger.pathNote,
                            fontSize: 7,
                            color: MUTED,
                            italics: true,
                          }]
                        : []),
                    ],
                  ),
                ]
              : []),
            ...(insights?.programmeSpotlights?.length && !deliveryLedger.topicRows.length
              ? [
                  borderedSegment(
                    'Programmes & courses this term',
                    buildProgrammeSpotlightPdfStack(insights.programmeSpotlights, {
                      ink: INK,
                      brand: BRAND,
                      muted: MUTED,
                    }),
                    BRAND,
                  ),
                ]
              : []),
            ...(deliveryLedger.nextLines.length && !showWhatWeTaught
              ? [
                  borderedSegment(
                    NEXT_TERM_FOCUS_LABEL,
                    buildNextLinesPdfCallout(deliveryLedger.nextLines, {
                      ink: INK,
                      brand: BRAND,
                      muted: MUTED,
                    }).slice(1),
                    BRAND,
                  ),
                ]
              : []),
          ]
        : []),

      ...(showSec('moduleCoverage') && !deliveryLedger.topicRows.length && insights?.moduleCoverage?.length
        ? [
            sectionTitle('Topics & module coverage', true),
            flowingDataTable(
              ['Programme', 'Course', 'Done', 'Plan', 'Cover %', 'Status'],
              insights.moduleCoverage.map((row) => [
                wrapPdfText(row.programme, { fontSize: 7.5, lineHeight: 1.2 }),
                wrapPdfText(row.course, { fontSize: 7.5, lineHeight: 1.2 }),
                { text: String(row.completed), fontSize: 8, alignment: 'center' },
                { text: String(row.planned), fontSize: 8, alignment: 'center' },
                { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right' },
                wrapPdfText(row.status, { fontSize: 7.5, color: row.status === 'Complete' ? '#067647' : MUTED, lineHeight: 1.15 }),
              ]),
              ['*', '*', 42, 42, 42, 58],
            ),
          ]
        : []),
      ...(!programmeReflections.length && insights?.programmeSpotlights?.length && !showSec('moduleCoverage') && !showDelivery
          ? [
              borderedSegment(
                'Curriculum delivery',
                buildProgrammeSpotlightPdfStack(insights.programmeSpotlights, {
                  ink: INK,
                  brand: BRAND,
                  muted: MUTED,
                }),
                BRAND,
              ),
            ]
          : []),
      ...(!programmeReflections.length && !insights?.programmeSpotlights?.length && insights?.programmeSpotlight && !showSec('moduleCoverage')
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
            {
              ...pairedSegmentColumns(
                borderedSegment(
                  'Learner highlights',
                  [textList((insights?.learnerHighlights || []).slice(0, 3).map(briefLearnerLine), '#067647')],
                  '#067647',
                  '#f0fdf4',
                ),
                borderedSegment(
                  'Celebration wall',
                  insights?.celebrationWall?.length
                    ? buildCelebrationWallPdfStack(
                        insights.celebrationWall.map((row) => ({
                          name: row.name,
                          classLabel: formatClassDisplay(row.className),
                          highlight: briefLearnerLine(`Result: ${String(row.highlight)}`).replace(/^Result:\s*/, ''),
                        })),
                        { ink: INK, brand: BRAND, muted: MUTED },
                      )
                    : [{ text: 'No Excellent band learners this term.', color: MUTED, italics: true, fontSize: 8 }],
                  BRAND,
                  '#fff7f7',
                ),
              ),
            },
          ]
        : []),
      ...(showSec('communityMessage')
        ? (() => {
            const communityText = resolveCommunityMessageForReport(
              insights?.communityMessage,
              narrative.executiveSummary,
            );
            return communityText
              ? [
                  borderedSegment(
                    'Message for your school community',
                    [
                      {
                        text: communityText,
                        fontSize: 8.5,
                        lineHeight: 1.35,
                        color: INK,
                        margin: [0, 0, 0, 4],
                      },
                      ...(design.reviewDateNote || insights?.suggestedPartnershipReview
                        ? [{
                            text: design.reviewDateNote || insights?.suggestedPartnershipReview || '',
                            fontSize: 7.5,
                            color: MUTED,
                            italics: true,
                          }]
                        : []),
                    ],
                    BRAND,
                  ),
                ]
              : [];
          })()
        : []),

      borderedSegment(
        'Recommendations for students',
        [numberedRecommendationCards(buildStudentRecommendations(snapshot, reportPolicy.display.maxRecommendations), reportPolicy.display.maxRecommendations)],
        BRAND,
      ),

      ...(showSec('boardBriefing')
        ? [
            sectionTitle('Partnership briefing', true),
      {
        ...pairedSegmentColumns(
          borderedSegment(
            'Strengths & excellence',
            [
              ...(overallTopScorer
                ? [{
                    table: {
                      widths: [58, '*'],
                      body: [[
                        {
                          stack: [
                            { text: fmtPct(overallTopScorer.averageScore), color: '#ffffff', bold: true, fontSize: 13, alignment: 'center' },
                            { text: 'Top score', color: '#d1fae5', bold: true, fontSize: 6, alignment: 'center', margin: [0, 2, 0, 0] },
                          ],
                          fillColor: '#067647',
                          margin: [4, 8, 4, 8],
                        },
                        {
                          stack: [
                            { text: 'Overall top scorer', color: '#067647', bold: true, fontSize: 6.5 },
                            { text: overallTopScorer.name, color: INK, bold: true, fontSize: 9, margin: [0, 2, 0, 1] },
                            { text: formatClassDisplay(overallTopScorer.className), color: MUTED, fontSize: 7 },
                          ],
                          fillColor: '#ecfdf3',
                          margin: [8, 6, 7, 6],
                        },
                      ]],
                    },
                    layout: 'noBorders',
                    margin: [0, 0, 0, 7],
                  }]
                : []),
              textList(pdfStrengthItems, '#067647'),
            ],
            '#067647',
            '#f0fdf4',
          ),
          borderedSegment(
            'Partnership focus',
            [textList(pdfFocusItems, BRAND)],
            BRAND,
            '#fff7f7',
          ),
        ),
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
          ]
        : []),
      ...(showNextPhaseSection
        ? [
            sectionTitle('Progressive next phase', true),
      ...(filteredNextPhaseSchool.map((phase) => ({
        stack: [
          { text: phase.phase, bold: true, fontSize: 9, color: INK, margin: [0, 0, 0, 1] },
          { text: phase.horizon, color: MUTED, fontSize: 7.5, margin: [0, 0, 0, 2] },
          textList(phase.actions),
        ],
        margin: [0, 0, 0, 4],
      })) as any[]),
      ...(filteredInvolvement.length
        ? [{
        stack: [
          { text: 'How everyone stays involved', style: 'subsection' },
          textList(filteredInvolvement),
        ],
        margin: [0, 2, 0, 8],
      }]
        : []),
      ...(insights?.nextPhaseLearners?.length
        ? [
            flowingDataTable(
              ['Learner band', 'Count', 'Next phase for this band'],
              insights.nextPhaseLearners.map((row) => [
                wrapPdfText(row.band, { fontSize: 8, bold: true, lineHeight: 1.2 }),
                { text: String(row.count), fontSize: 8, alignment: 'center' },
                wrapPdfText(row.nextStep, { fontSize: 7.5, color: MUTED, lineHeight: 1.25 }),
              ]),
              [90, 36, '*'],
            ),
          ]
        : []),
          ]
        : []),

      ...(showSec('charts')
        ? [
            { text: 'Score and attendance distribution', style: 'subsection', color: BRAND, pageBreak: 'before' as const },
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
      ...(programmeCoverageRows.length && !deliveryLedger.topicRows.length
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
        REPORT_METRIC_LABELS.classMeanScores,
        snapshot.classPerformance.map((row) => ({
          label: formatClassDisplay(row.className),
          value: row.averageScore,
          color: scoreColor(row.averageScore),
        })),
        { maxBars: 10 },
      ),
      flowingDataTable(['Class', 'Teacher', 'Learners', 'Mean %', 'Attend %', 'Subs'], classRows, ['*', 70, 42, 48, 52, 42], { margin: [0, 8, 0, 10] }),
      ...(programmeCourseRows.length
        ? [
            {
              text: REPORT_METRIC_LABELS.programmeCourseOutcomes,
              style: 'subsection',
              color: BRAND,
              margin: [0, 4, 0, 2],
            },
            barChartBlock(
              REPORT_METRIC_LABELS.meanByProgrammeCourse,
              programmeCourseRows.map((row) => ({
                label: formatProgrammeCourseDisplay(row.programme, row.course),
                value: row.submissions > 0 ? row.averageScore : 0,
                color: row.submissions > 0 ? scoreColor(row.averageScore) : '#94a3b8',
              })),
              { maxBars: 12 },
            ),
            flowingDataTable(
              ['Programme', 'Course', REPORT_METRIC_LABELS.enrolledLearners, REPORT_METRIC_LABELS.assessedLearners, REPORT_METRIC_LABELS.meanPercent],
              programmeRows,
              [88, '*', 42, 48, 42],
              { margin: [0, 6, 0, 8] },
            ),
          ]
        : []),
          ]
        : []),
      ...(!showSec('charts') && programmeCourseRows.length
        ? [
            sectionTitle(REPORT_METRIC_LABELS.programmeCourseOutcomes, true),
            flowingDataTable(
              ['Programme', 'Course', REPORT_METRIC_LABELS.enrolledLearners, REPORT_METRIC_LABELS.assessedLearners, REPORT_METRIC_LABELS.meanPercent],
              programmeRows,
              [88, '*', 42, 48, 42],
            ),
          ]
        : []),
      ...(showSec('teacherRoster')
        ? [
            sectionTitle('Assigned teachers', true),
            flowingDataTable(['Teacher', 'How assigned', 'Classes', 'Class list'], staffRows, ['*', 100, 42, '*']),
          ]
        : []),

      ...(!showSec('moduleCoverage') && !deliveryLedger.topicRows.length && !showDelivery
        ? [
            sectionTitle('Programme delivery summary', true),
      {
        text: hasStaffDelivery
          ? `${snapshot.deliveryDeclaration?.selectedTopics.length || 0} module topic(s) confirmed for this reporting period  |  ${snapshot.curriculum.completedWeeks} module unit(s) delivered  |  ${snapshot.curriculum.plannedWeeks}-unit reporting window`
          : `${snapshot.curriculum.completedWeeks} completed  |  ${snapshot.curriculum.inProgressWeeks} in progress  |  ${snapshot.curriculum.plannedWeeks} planned`,
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 6],
      },
      flowingDataTable(
        ['Course', 'Programme', 'Delivered', 'Active', 'Deferred', 'Coverage'],
        curriculumRows,
        ['*', 72, 40, 40, 40, 42],
      ),
          ]
        : []),

      ...(snapshot.previousTerm
        ? [
            sectionTitle('Previous-term comparison', true),
            withMinPresence(
              {
                unbreakable: true,
                stack: [
                  {
                    text: `Compared with ${snapshot.previousTerm.termLabel}, ${snapshot.previousTerm.academicYear}. Figures show the published report for each period.`,
                    color: MUTED,
                    fontSize: 8,
                    margin: [0, 0, 0, 5],
                  },
                  {
                    table: {
                      widths: ['*', 75, 75, 75],
                      body: [
                        headerCells(['Period', REPORT_METRIC_LABELS.meanScore, 'Attendance', 'Curriculum']),
                        [
                          { text: `${snapshot.previousTerm.termLabel}, ${snapshot.previousTerm.academicYear}`, fontSize: 8 },
                          { text: fmtPct(snapshot.previousTerm.averageScore), alignment: 'right', fontSize: 8 },
                          { text: fmtPct(snapshot.previousTerm.attendanceRate), alignment: 'right', fontSize: 8 },
                          { text: fmtPct(snapshot.previousTerm.curriculumCoverage), alignment: 'right', fontSize: 8 },
                        ],
                        [
                          { text: `${snapshot.period.termLabel}, ${snapshot.period.academicYear}`, bold: true, fontSize: 8 },
                          { text: fmtPct(snapshot.summary.averageScore), alignment: 'right', bold: true, fontSize: 8 },
                          { text: fmtPct(snapshot.summary.attendanceRate), alignment: 'right', bold: true, fontSize: 8 },
                          { text: fmtPct(snapshot.summary.curriculumCoverage), alignment: 'right', bold: true, fontSize: 8 },
                        ],
                      ],
                    },
                    layout: tableLayout(),
                  },
                ],
              },
              PDF_MIN_TABLE,
            ),
          ]
        : []),

      sectionTitle('Closing remark'),
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
                { text: reportPolicy.signatory.name, bold: true, fontSize: 9, margin: [0, 3, 0, 0] },
                { text: reportPolicy.signatory.title, color: MUTED, fontSize: 7.5 },
              ],
            },
            {
              stack: [
                { text: isPublished ? 'OFFICIALLY ISSUED' : 'DRAFT PREVIEW', style: 'metaLabel', color: isPublished ? '#067647' : BRAND, alignment: 'right' },
                { text: `${snapshot.period.termLabel}  |  ${snapshot.period.academicYear}`, bold: true, fontSize: 9, alignment: 'right', margin: [0, 8, 0, 2] },
                { text: `Generated ${generatedLabel}`, color: MUTED, fontSize: 7.5, alignment: 'right' },
                ...(isPublished
                  ? [{ text: 'This signature authenticates the published report.', color: MUTED, fontSize: 7, alignment: 'right', margin: [0, 8, 0, 0] as [number, number, number, number] }]
                  : []),
              ],
            },
          ]],
        },
        layout: borderedPanelLayout('#f9fafb'),
        margin: [0, 8, 0, 8],
      },
      {
        table: {
          widths: [58, '*'],
          body: [[
            opts?.verificationQrDataUrl
              ? { image: opts.verificationQrDataUrl, width: 48, height: 48, margin: [3, 3, 3, 3] }
              : { text: 'VERIFY', bold: true, alignment: 'center', margin: [3, 18, 3, 3] },
            {
              stack: [
                { text: 'REPORT VERIFICATION', style: 'metaLabel', color: BRAND },
                { text: verificationCode, bold: true, fontSize: 8.5, margin: [0, 3, 0, 2] },
                { text: verificationUrl, color: MUTED, fontSize: 6.5 },
                { text: `Revision ${report.published_revision_number || 1} | Scan or enter the code to confirm this report.`, color: MUTED, fontSize: 7, margin: [0, 3, 0, 0] },
              ],
              margin: [6, 6, 6, 6],
            },
          ]],
        },
        layout: borderedPanelLayout('#ffffff'),
        margin: [0, 0, 0, 7],
      },
      ...(report.acknowledged_at
        ? [{
            text: `Acknowledged by ${report.acknowledgement_name || 'school leadership'} on ${new Date(report.acknowledged_at).toLocaleDateString('en-GB')}${report.acknowledgement_note ? `. ${report.acknowledgement_note}` : '.'}`,
            color: '#067647',
            bold: true,
            fontSize: 7,
            margin: [0, 0, 0, 5] as [number, number, number, number],
          }]
        : []),
      {
        text: `Prepared by ${brandContact.displayName}  |  ${brandContact.web}. Official school performance report for ${snapshot.period.termLabel}, ${snapshot.period.academicYear}.`,
        color: MUTED,
        fontSize: 7,
        margin: [0, 2, 0, 0],
      },

      ...(showSec('learnerRoster')
        ? [
            appendixSectionStack(
              appendixHero({
                letter: 'A',
                title: 'Learner roster',
                subtitle: `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — printable roster with exam scores, attendance, and status. Detach and archive for school records.`,
                accent: APPENDIX_A_ACCENT,
                chips: [
                  { label: 'Active learners', value: String(sortedLearners.length) },
                  { label: 'Assessed', value: String(rosterAssessedCount) },
                  { label: 'Excellent', value: String(rosterExcellentCount) },
                ],
              }),
              printableAppendixTable(
                [
                  appendixHeaderCells(['Learner', 'Grade', 'Class', 'Theory', 'Practical', 'Exam', 'Attend', 'Status']),
                  ...learnerRows,
                ],
                ['*', 34, 64, 30, 30, 30, 34, 54],
                APPENDIX_ROSTER_TINT,
              ),
              true,
            ),
          ]
        : []),

      ...(showSec('finance')
        ? [
            {
              stack: [
                appendixSectionStack(
                  appendixHero({
                    letter: 'B',
                    title: 'School invoice',
                    subtitle: snapshot.finance.attached
                      ? `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — term invoice summary.`
                      : `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — invoice details to follow.`,
                    accent: APPENDIX_B_ACCENT,
                    chips: [
                      { label: 'Invoiced', value: formatMoney(snapshot.finance.totalInvoiced, snapshot.finance.currency, reportPolicy.finance.locale) },
                      { label: 'Paid', value: formatMoney(snapshot.finance.totalPaid, snapshot.finance.currency, reportPolicy.finance.locale) },
                      { label: 'Outstanding', value: formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale) },
                    ],
                  }),
                  printableAppendixTable(
                    [appendixHeaderCells(['Invoice', 'Status', 'Amount', 'Paid', 'Balance']), ...invoiceRows],
                    ['*', 70, 70, 66, 66],
                    APPENDIX_ROSTER_TINT,
                  ),
                  true,
                ),
            ...(snapshot.finance.attached
              ? []
              : [{
                  text: 'Term invoice is not included in this edition.',
                  color: MUTED,
                  fontSize: 7,
                  margin: [0, 0, 0, 4] as [number, number, number, number],
                }]),
            paymentAccountsBlock(paymentAccounts, reportPolicy),
              ],
              margin: [0, 0, 0, 4],
            },
          ]
        : []),

      ...(showSec('appendixGradebook')
        ? [appendixSectionStack(
          appendixHero({
            letter: 'C',
            title: 'Classwork, assignments and assessment',
            subtitle: `${formatTermPeriod(snapshot)}. One row per learner with published progress report component scores. Theory, practical and exam results are in Appendix A.`,
            accent: APPENDIX_C_ACCENT,
            showDetachNote: true,
            chips: [
              { label: 'With evidence', value: `${learnersWithAssignmentEvidence}/${sortedLearners.length}` },
              { label: 'Learners', value: String(sortedLearners.length) },
            ],
          }),
          printableAppendixTable(
            [
              appendixHeaderCells(['Learner', 'Classwork', 'Assignments', 'Assessment']),
              ...appendixCSummaryRows,
            ],
            ['*', 52, 52, 52],
            APPENDIX_GRADEBOOK_TINT,
          ),
          true,
        )]
        : []),

      ...(showSec('appendixPayment') && snapshot.finance.totalPaid > 0 ? [appendixSectionStack(
          appendixHero({
            letter: 'D',
            title: 'Payment confirmation',
            subtitle: `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — printable payment schedule for reconciliation. Keep with your bank receipt.`,
            accent: APPENDIX_D_ACCENT,
            chips: [
              { label: 'Paid', value: formatMoney(snapshot.finance.totalPaid, snapshot.finance.currency, reportPolicy.finance.locale) },
              { label: 'Invoices', value: String(snapshot.finance.invoices.filter((row) => row.paid > 0).length) },
              { label: 'Outstanding', value: formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale) },
            ],
          }),
          printableAppendixTable(
            [
              appendixHeaderCells(['Invoice', 'Payment recorded', 'Balance', 'Status']),
              ...snapshot.finance.invoices.filter((row) => row.paid > 0).map((row) => [
                { text: row.invoiceNumber, bold: true, fontSize: 7, color: INK },
                { text: formatMoney(row.paid, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 7, color: INK, alignment: 'right' as const },
                { text: formatMoney(row.outstanding, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 7, color: INK, alignment: 'right' as const },
                { text: row.status || (row.outstanding > 0 ? 'Part paid' : 'Paid'), fontSize: 7, color: INK },
              ]),
            ],
            ['*', 82, 82, 70],
            APPENDIX_ROSTER_TINT,
          ),
          true,
        )] : []),

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
  const verificationQrDataUrl = await qrDataUrl(schoolReportVerificationUrl(report.id), 180);
  return renderPdfToBuffer(buildSchoolReportPdfDefinition(enriched, { ...opts, verificationQrDataUrl }));
}
