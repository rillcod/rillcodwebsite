import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import { ROSTER_EMBEDDED_LOGO_DATA_URL, ROSTER_LOGO_ASPECT } from '@/lib/cards/rosterBrandLogo';
import { parseGrade } from '@/lib/classes/naming';
import { brandAssets } from '@/config/brand';
import type jsPDF from 'jspdf';

export type StudentRosterRow = {
  name: string;
  className: string;
  section: string;
  rcNumber: string;
  rcDisplay: string;
  resultCheckUrl: string;
};

export type StudentRosterInput = {
  id: string;
  name: string;
  gradeLevel?: string | null;
  sectionClass?: string | null;
  roleLabel?: string;
};

export type RosterClassGroup = {
  className: string;
  rows: StudentRosterRow[];
};

export type RosterSectionGroup = {
  sectionName: string;
  className: string;
  rows: StudentRosterRow[];
};

export type RosterPdfGroup = {
  label: string;
  subtitle?: string;
  rows: StudentRosterRow[];
};

/** Shared copy for Card Studio roster UI and exported PDFs. */
export const ROSTER_EDUCATOR_HEADING = 'For educator in charge';
export const ROSTER_PARENT_HEADING = 'For parents / guardians';
export const ROSTER_EDUCATOR_NOTE =
  'For the educator in charge of this class. Share this list with parents — they check results on their own.';

export const ROSTER_EDUCATOR_STEPS = [
  'Share in the class WhatsApp group, or print and send home.',
  'Each parent finds their child\'s RC number in the list below.',
  'Parents open rillcod.com/result-check on their phone to view the coding report.',
] as const;

/** @deprecated Use ROSTER_EDUCATOR_STEPS */
export const ROSTER_TEACHER_STEPS = ROSTER_EDUCATOR_STEPS;

export const ROSTER_PARENT_STEPS = [
  'Open rillcod.com/result-check on your phone.',
  'Enter your child\'s RC number from this school list (8 digits on new cards; letters on older cards).',
  'Enter your name, email, and phone — then the 6-digit code sent to your email.',
  'The coding report opens on the same page. Portal login details are emailed to you.',
] as const;

export const ROSTER_SIGNATURE_LABEL = 'Educator in charge signature';

export const ROSTER_LEGACY_NOTE =
  'Older access cards may show letter codes (e.g. RC-AB12-CD34) or work by QR scan only — all formats are accepted.';

/** Short section label for compact roster table cells (single line). */
export function formatRosterSectionDisplay(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s || s.includes('No Section')) return '—';
  if (s.includes(' · ')) {
    const parts = s.split(' · ').map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1] || s;
    const letter = last.match(/^([A-D])$/i) || last.match(/Section\s*([A-D0-9]+)/i) || last.match(/\b([A-D])\b/i);
    if (letter) return letter[1].toUpperCase();
    if (last.length <= 10) return last;
    return `${last.slice(0, 9)}…`;
  }
  const compact = s.match(/^(?:Section\s*)?([A-D0-9]+)$/i);
  if (compact) return compact[1].toUpperCase();
  if (s.length > 12) return `${s.slice(0, 11)}…`;
  return s;
}

function gradeSortKey(raw: string): number {
  const s = raw.trim();
  if (!s || s.includes('No Class')) return 9999;
  const g = parseGrade(s);
  if (!g) return 8500;
  const lvl = g.lvl === 'JS' ? 'JSS' : g.lvl === 'SSS' ? 'SS' : g.lvl;
  const band: Record<string, number> = { Nursery: 0, Basic: 100, Year: 180, JSS: 200, SS: 300 };
  return (band[lvl] ?? 400) + g.n;
}

/** Sort class names (Nursery → Basic → JSS → SS) with numeric grade order. */
export function compareClassNames(a: string, b: string): number {
  const ra = gradeSortKey(a);
  const rb = gradeSortKey(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Sort section names (A, B, C… or numeric sections) naturally. */
export function compareSectionNames(a: string, b: string): number {
  const rank = (raw: string) => {
    const s = raw.trim();
    if (!s || s.includes('No Section')) return 9999;
    const letter = s.match(/^([A-D])$/i) || s.match(/\b([A-D])$/i);
    if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65;
    const num = s.match(/(\d+)/);
    if (num) return 100 + parseInt(num[1], 10);
    return 500;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function csvEscape(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Name + class + RC number rows for teachers / parent distribution. */
export function buildStudentRosterRows(
  records: StudentRosterInput[],
  origin = 'https://www.rillcod.com',
): StudentRosterRow[] {
  const base = origin.replace(/\/$/, '');
  return records
    .filter((r) => !r.roleLabel || r.roleLabel === 'Student')
    .map((r) => {
      const rc = accessCardCodeForStudent(r.id);
      const display = formatAccessCardCodeDisplay(rc);
      return {
        name: r.name,
        className: r.gradeLevel || '',
        section: r.sectionClass || '',
        rcNumber: rc.replace(/^RC-/, ''),
        rcDisplay: display,
        resultCheckUrl: `${base}/result-check/${encodeURIComponent(rc)}`,
      };
    })
    .filter((r) => r.rcNumber.length === 8)
    .sort((a, b) => {
      const classCmp = compareClassNames(a.className || 'zzz', b.className || 'zzz');
      if (classCmp !== 0) return classCmp;
      const sectionCmp = compareSectionNames(a.section || 'zzz', b.section || 'zzz');
      if (sectionCmp !== 0) return sectionCmp;
      return a.name.localeCompare(b.name);
    });
}

export function groupRosterRowsByClass(rows: StudentRosterRow[]): Map<string, StudentRosterRow[]> {
  const map = new Map<string, StudentRosterRow[]>();
  rows.forEach((row) => {
    const key = row.className || '— No Class —';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  return map;
}

/** One group per class (grade) — used for roster PDFs and Card Studio roster view. */
export function buildRosterClassGroups(rows: StudentRosterRow[]): RosterClassGroup[] {
  return Array.from(groupRosterRowsByClass(rows).entries())
    .sort(([a], [b]) => compareClassNames(a, b))
    .map(([className, classRows]) => ({ className, rows: classRows }));
}

/** Section groups within each class — for section-specific teacher handouts. */
export function buildRosterSectionGroups(rows: StudentRosterRow[]): RosterSectionGroup[] {
  const map = new Map<string, StudentRosterRow[]>();
  rows.forEach((row) => {
    const key = `${row.className || '— No Class —'}\0${row.section || '— No Section —'}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  return Array.from(map.entries())
    .map(([key, sectionRows]) => {
      const [className, sectionName] = key.split('\0');
      return { className, sectionName, rows: sectionRows };
    })
    .sort((a, b) => {
      const cc = compareClassNames(a.className, b.className);
      if (cc !== 0) return cc;
      return a.sectionName.localeCompare(b.sectionName);
    });
}

export function buildRosterPdfGroups(
  rows: StudentRosterRow[],
  mode: 'class' | 'section' = 'class',
): RosterPdfGroup[] {
  if (mode === 'section') {
    return buildRosterSectionGroups(rows).map((g) => ({
      label: g.sectionName,
      subtitle: g.className,
      rows: g.rows,
    }));
  }
  return buildRosterClassGroups(rows).map((g) => ({
    label: g.className,
    rows: g.rows,
  }));
}

export function downloadStudentRosterCsv(rows: StudentRosterRow[], filename: string) {
  const head = ['#', 'Student Name', 'Class', 'Section', 'RC Number', 'Result Check Link'];
  const lines = rows.map((row, index) => [
    String(index + 1),
    row.name,
    row.className,
    row.section,
    row.rcDisplay,
    row.resultCheckUrl,
  ].map(csvEscape).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function rosterTableHtml(
  rows: StudentRosterRow[],
  opts?: { classLabel?: string; hideClassColumn?: boolean },
) {
  const body = rows.map((row, index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td class="name">${escapeHtml(row.name)}</td>
      ${opts?.hideClassColumn ? '' : `<td>${escapeHtml(row.className || '—')}</td>`}
      <td class="section">${escapeHtml(formatRosterSectionDisplay(row.section))}</td>
      <td class="mono">${escapeHtml(row.rcDisplay)}</td>
    </tr>
  `).join('');

  return `
    ${opts?.classLabel ? `<h2>${escapeHtml(opts.classLabel)}</h2>` : ''}
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Student Name</th>
          ${opts?.hideClassColumn ? '' : '<th>Class</th>'}
          <th>Section</th>
          <th>RC Number</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lightweight printable table for class teachers (no full card layout). */
export function openStudentRosterPrint(
  rows: StudentRosterRow[],
  title: string,
  groupedByClass?: RosterClassGroup[],
  opts?: { orgName?: string; orgWebsite?: string; accentColor?: string },
) {
  const groups = groupedByClass && groupedByClass.length > 0
    ? groupedByClass
    : [{ className: '', rows }];

  const org = formatOrgDisplay(opts?.orgName);
  const orgWebsite = formatWebsiteDisplay(opts?.orgWebsite);
  const accent = opts?.accentColor || DEFAULT_ACCENT;
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const tables = groups.map((group, index) => {
    const classLabel = group.className || title;
    return `
    <div class="grade-block${index > 0 ? ' grade-break' : ''}">
      ${group.className ? `
        <div class="class-banner">
          <span class="class-label">Class</span>
          <span class="class-name">${escapeHtml(group.className)}</span>
          <span class="class-count">${group.rows.length} student${group.rows.length === 1 ? '' : 's'}</span>
        </div>
      ` : ''}
      ${rosterInstructionsHtml(classLabel, accent)}
      ${rosterTableHtml(group.rows, { hideClassColumn: !!group.className })}
      <p class="signature">${escapeHtml(ROSTER_SIGNATURE_LABEL)}: ________________________________ &nbsp;&nbsp; Date: ____________</p>
    </div>
  `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #111827; margin: 0; background: #fff; font-size: 11px; line-height: 1.45; }
    .page { max-width: 182mm; margin: 0 auto; }
    .letterhead {
      background: #fff; color: #111827;
      padding: 7mm 0 6mm;
      border-top: 3px solid ${accent};
      border-bottom: 1px solid #374151;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
    }
    .letterhead-logo {
      height: 56px;
      width: auto;
      max-width: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      align-self: center;
      background: transparent;
      border: none;
      padding: 0;
    }
    .letterhead-logo img { max-height: 56px; max-width: 64px; width: auto; height: auto; object-fit: contain; display: block; }
    .letterhead-brand {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-height: 56px;
      align-self: center;
    }
    .letterhead-brand .doc-title {
      font-size: 13px; margin: 0; letter-spacing: 0.08em;
      text-transform: uppercase; font-weight: 800; line-height: 1.2; color: ${accent};
    }
    .letterhead-brand h1 {
      font-size: 11px; margin: 0; letter-spacing: 0.05em;
      text-transform: uppercase; font-weight: 800; line-height: 1.2; color: #111827;
    }
    .letterhead-brand .site { font-size: 9px; color: #4b5563; margin: 0; font-weight: 500; line-height: 1.3; }
    .letterhead-brand .doc-type { display: none; }
    .letterhead-meta {
      text-align: right; font-size: 9px; line-height: 1.45; color: #4b5563;
      min-width: 110px; align-self: center;
      display: flex; flex-direction: column; justify-content: center; gap: 2px;
    }
    .badge {
      display: inline-block;
      background: #fff; color: #111827;
      border: 1px solid #374151;
      font-size: 7px; font-weight: 800; letter-spacing: 0.12em;
      padding: 4px 8px; border-radius: 2px; margin-bottom: 5px;
    }
    .doc-body { padding: 8mm 0 10mm; }
    .doc-title { margin: 0 0 10px; padding-bottom: 8px; border-bottom: 2px solid ${accent}; }
    .doc-title h2 { font-size: 20px; margin: 0; color: #111827; font-weight: 800; }
    .doc-title p { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
    .info-panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
      background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;
      padding: 10px 12px; margin-bottom: 14px; font-size: 11px;
    }
    .info-panel .label { font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin-bottom: 2px; }
    .info-panel .value { font-weight: 700; color: #111827; }
    .info-panel .url-box {
      grid-column: 1 / -1;
      background: #fff; border: 2px solid #111827; border-radius: 4px;
      padding: 10px 12px; text-align: center;
    }
    .info-panel .url-box .label { margin-bottom: 4px; }
    .info-panel .url-box .url { font-family: ui-monospace, monospace; font-size: 14px; font-weight: 800; color: #111827; letter-spacing: 0.02em; }
    .url-callout {
      background: #fff; border: 2px solid #111827; border-radius: 4px;
      padding: 10px 12px; margin-bottom: 12px; text-align: center;
      break-inside: avoid; page-break-inside: avoid;
    }
    .url-callout-label { font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin-bottom: 5px; }
    .url-callout-url { font-family: ui-monospace, monospace; font-size: 15px; font-weight: 800; color: #111827; letter-spacing: 0.03em; }
    .instructions { border: 1px solid #374151; border-radius: 6px; overflow: hidden; margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
    .instructions-head {
      background: #f3f4f6; color: #111827;
      font-size: 8px; font-weight: 800; letter-spacing: 0.1em;
      padding: 7px 12px; text-transform: uppercase;
      border-bottom: 1px solid #374151; text-align: center;
    }
    .instructions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .instructions-col { padding: 0; font-size: 10px; line-height: 1.45; color: #4b5563; }
    .instructions-col-educator { background: #f8fafc; border-right: 1px solid #9ca3af; }
    .instructions-col-parent { background: #fff; }
    .instructions-col-head {
      margin: 0; padding: 6px 10px; font-size: 8px; font-weight: 800;
      letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid #d1d5db;
    }
    .instructions-col-educator .instructions-col-head { background: #e0e7ff; color: #1e3a8f; }
    .instructions-col-parent .instructions-col-head { background: #d1fae5; color: #065f46; }
    .instructions-col-body { padding: 8px 10px 10px; }
    .instructions-note { margin: 0 0 6px; font-size: 9px; line-height: 1.4; color: #6b7280; font-style: italic; }
    .instructions-col ol { margin: 0; padding-left: 16px; }
    .instructions-col li { margin-bottom: 3px; }
    .grade-block { margin-bottom: 8px; }
    .grade-break { break-before: page; page-break-before: always; }
    .class-banner { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; }
    .class-label { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #374151; }
    .class-name { font-size: 13px; font-weight: 700; color: #111827; }
    .class-count { margin-left: auto; font-size: 10px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
    th, td { border: 1px solid #9ca3af; padding: 6px 8px; text-align: left; vertical-align: middle; }
    th {
      background: #f3f4f6; color: #111827;
      font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800;
      border-bottom: 2px solid #374151;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    td.mono {
      font-family: ui-monospace, "Cascadia Code", monospace; font-weight: 800;
      letter-spacing: 0.08em; color: #111827; background: #fff;
      text-align: center; font-size: 11px; border-left: 2px solid #374151;
    }
    td.section { max-width: 48px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #374151; font-weight: 600; text-align: center; }
    td.num, th.num { width: 32px; text-align: center; color: #6b7280; font-weight: 600; }
    td.name { font-weight: 600; }
    .foot { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #6b7280; line-height: 1.5; }
    .signature { margin-top: 12px; font-size: 10px; color: #374151; break-inside: avoid; page-break-inside: avoid; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="letterhead">
      <div class="letterhead-logo">
        <img src="${ROSTER_EMBEDDED_LOGO_DATA_URL}" alt="Rillcod"/>
      </div>
      <div class="letterhead-brand">
        <p class="doc-title">${escapeHtml(ROSTER_DOC_TAGLINE)}</p>
        <h1>${escapeHtml(org)}</h1>
        <p class="site">${escapeHtml(orgWebsite)}</p>
      </div>
      <div class="letterhead-meta">
        <div class="badge">Official Document</div>
        <div>${escapeHtml(dateStr)}</div>
        <div>${rows.length} student${rows.length === 1 ? '' : 's'}</div>
      </div>
    </header>

    <div class="doc-body">
      <div class="info-panel">
        <div>
          <div class="label">Document</div>
          <div class="value">${escapeHtml(title)}</div>
        </div>
        <div>
          <div class="label">Date</div>
          <div class="value">${escapeHtml(dateStr)}</div>
        </div>
        <div class="url-box">
          <div class="label">Parents verify results at</div>
          <div class="url">${escapeHtml(RESULT_CHECK_URL)}</div>
        </div>
      </div>

      ${tables}

      <div class="foot">
        <p>${escapeHtml(ROSTER_LEGACY_NOTE)}</p>
      </div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}

export function groupRosterRowsBySection(rows: StudentRosterRow[]) {
  const map = new Map<string, StudentRosterRow[]>();
  rows.forEach((row) => {
    const key = row.section || '— No Section —';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  return map;
}

export type StudentRosterPdfOptions = {
  title: string;
  filename?: string;
  /** save = download file; print = open PDF in new tab for printing */
  mode?: 'save' | 'print';
  orgName?: string;
  orgWebsite?: string;
  accentColor?: string;
  /** Site origin for logo fetch (browser PDF export). */
  origin?: string;
  /** @deprecated Prefer pdfGroups */
  classGroups?: RosterClassGroup[];
  pdfGroups?: RosterPdfGroup[];
  /** How to split pages when pdfGroups/classGroups not provided. */
  groupMode?: 'class' | 'section';
};

const DEFAULT_ACCENT = '#1A3A8F';
const RESULT_CHECK_URL = 'www.rillcod.com/result-check';
const PAGE_MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const HEADER_BAND_H = 34;
const DOC_TITLE_BAND_H = 9;
const ROSTER_DOC_TAGLINE = 'Student Result Verification';
const FOOTER_RESERVE = 18;
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];
const PANEL_BG: [number, number, number] = [249, 250, 251];
const ZEBRA: [number, number, number] = [248, 250, 252];
const TABLE_HEAD_BG: [number, number, number] = [243, 244, 246];
const TABLE_HEAD_INK: [number, number, number] = [17, 24, 39];
const TABLE_HEAD_RULE: [number, number, number] = [55, 65, 81];

/** Clean website / URL for display on printed rosters. */
function formatWebsiteDisplay(raw: string | undefined | null): string {
  let s = String(raw || 'www.rillcod.com').trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^www\./i, '');
  s = s.replace(/\/+$/, '');
  if (!s) return 'rillcod.com';
  return s.includes('/') ? s : `www.${s}`;
}

function formatOrgDisplay(raw: string | undefined | null): string {
  return String(raw || 'Rillcod Technologies').trim() || 'Rillcod Technologies';
}

function hexToRgb(hex: string | undefined): [number, number, number] {
  const h = String(hex || DEFAULT_ACCENT).replace('#', '').trim();
  if (h.length !== 6) return [26, 58, 143];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function tintRgb(base: [number, number, number], mix = 0.92): [number, number, number] {
  return [
    Math.round(base[0] * (1 - mix) + 255 * mix),
    Math.round(base[1] * (1 - mix) + 255 * mix),
    Math.round(base[2] * (1 - mix) + 255 * mix),
  ];
}

function rosterDocumentRef(className: string, dateIso: string): string {
  const slug = className.replace(/[^a-z0-9]+/gi, '').slice(0, 8).toUpperCase() || 'ROSTER';
  return `RCR-${slug}-${dateIso.replace(/-/g, '')}`;
}

function imageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function loadImageViaCanvas(src: string): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 64;
        const h = img.naturalHeight || 64;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadRosterLogoDataUrl(origin?: string): Promise<string> {
  const base = origin?.replace(/\/$/, '') ?? '';
  const candidates = [
    base ? `${base}${brandAssets.logoMono}` : '',
    base ? `${base}/images/logoA.png` : '',
    base ? `${base}/logoA.png` : '',
    brandAssets.logoCloudinary,
  ].filter(Boolean);

  for (const src of candidates) {
    const dataUrl = await loadImageViaCanvas(src);
    if (dataUrl) return dataUrl;
  }

  return ROSTER_EMBEDDED_LOGO_DATA_URL;
}

function rosterUrlCalloutHtml(accent: string) {
  return `
    <div class="url-callout">
      <div class="url-callout-label">Parents verify results at</div>
      <div class="url-callout-url">${escapeHtml(RESULT_CHECK_URL)}</div>
    </div>
  `;
}

function rosterInstructionsHtml(classLabel: string, accent: string) {
  return `
    ${rosterUrlCalloutHtml(accent)}
    <div class="instructions">
      <div class="instructions-head">Distribution guide — ${escapeHtml(classLabel)}</div>
      <div class="instructions-grid">
        <div class="instructions-col instructions-col-educator">
          <p class="instructions-col-head">${escapeHtml(ROSTER_EDUCATOR_HEADING)}</p>
          <div class="instructions-col-body">
            <p class="instructions-note">${escapeHtml(ROSTER_EDUCATOR_NOTE)}</p>
            <ol>${ROSTER_EDUCATOR_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
          </div>
        </div>
        <div class="instructions-col instructions-col-parent">
          <p class="instructions-col-head">${escapeHtml(ROSTER_PARENT_HEADING)}</p>
          <div class="instructions-col-body">
            <ol>${ROSTER_PARENT_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
          </div>
        </div>
      </div>
    </div>
  `;
}

function drawInstructionsPanel(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  accentRgb: [number, number, number],
  classLabel: string,
): number {
  const gutter = 6;
  const colW = (width - gutter - 10) / 2;
  const leftX = x + 5;
  const rightX = leftX + colW + gutter;
  const colHeadH = 6;
  const lineH = 3.5;
  const headerH = 8;
  const bodyFont = 7;
  const noteFont = 6.5;
  const pad = 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFont);

  let leftBodyH = pad;
  doc.setFontSize(noteFont);
  leftBodyH += doc.splitTextToSize(ROSTER_EDUCATOR_NOTE, colW - pad * 2).length * 2.8 + 2;
  doc.setFontSize(bodyFont);
  ROSTER_EDUCATOR_STEPS.forEach((line, i) => {
    leftBodyH += doc.splitTextToSize(`${i + 1}. ${line}`, colW - pad * 2).length * lineH;
  });

  let rightBodyH = pad;
  ROSTER_PARENT_STEPS.forEach((line, i) => {
    rightBodyH += doc.splitTextToSize(`${i + 1}. ${line}`, colW - pad * 2).length * lineH;
  });

  const contentH = colHeadH + Math.max(leftBodyH, rightBodyH) + pad;
  const panelH = headerH + contentH;
  const panelTop = y;
  const contentTop = panelTop + headerH;
  const dividerX = leftX + colW + gutter / 2;

  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...TABLE_HEAD_RULE);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, panelTop, width, panelH, 1.5, 1.5, 'FD');

  doc.setFillColor(...TABLE_HEAD_BG);
  doc.rect(x, panelTop, width, headerH, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`Distribution guide — ${classLabel}`, x + width / 2, panelTop + 5.5, { align: 'center' });

  doc.setFillColor(232, 236, 255);
  doc.rect(leftX, contentTop, colW, colHeadH, 'F');
  doc.setFillColor(209, 250, 229);
  doc.rect(rightX, contentTop, colW, colHeadH, 'F');

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.15);
  doc.line(dividerX, contentTop, dividerX, panelTop + panelH - 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(30, 58, 138);
  doc.text(ROSTER_EDUCATOR_HEADING.toUpperCase(), leftX + pad, contentTop + 4.2);
  doc.setTextColor(6, 95, 70);
  doc.text(ROSTER_PARENT_HEADING.toUpperCase(), rightX + pad, contentTop + 4.2);

  let ly = contentTop + colHeadH + pad + 2;
  let ry = contentTop + colHeadH + pad + 2;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(noteFont);
  doc.setTextColor(...MUTED);
  const noteLines = doc.splitTextToSize(ROSTER_EDUCATOR_NOTE, colW - pad * 2);
  doc.text(noteLines, leftX + pad, ly);
  ly += noteLines.length * 2.8 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFont);
  doc.setTextColor(...INK);
  ROSTER_EDUCATOR_STEPS.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, colW - pad * 2);
    doc.text(wrapped, leftX + pad, ly);
    ly += wrapped.length * lineH;
  });
  ROSTER_PARENT_STEPS.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, colW - pad * 2);
    doc.text(wrapped, rightX + pad, ry);
    ry += wrapped.length * lineH;
  });

  return panelTop + panelH + 5;
}

function drawClassMetaPanel(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  accentRgb: [number, number, number],
  opts: { className: string; sectionName?: string; studentCount: number },
): number {
  const { className, sectionName, studentCount } = opts;
  const pad = 4;
  const urlBoxH = 14;
  const metaH = 7;
  const panelH = metaH + urlBoxH + 5;
  const panelTop = y;

  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, panelTop, width, panelH, 2, 2, 'F');

  const rowY = panelTop + 4.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const classLine = sectionName
    ? `Class: ${className} · Section: ${sectionName} · ${studentCount} student${studentCount === 1 ? '' : 's'}`
    : `Class: ${className} · ${studentCount} student${studentCount === 1 ? '' : 's'}`;
  const classLines = doc.splitTextToSize(classLine, width - pad * 2);
  doc.text(classLines.slice(0, 1), x + pad, rowY);

  const urlBoxY = panelTop + metaH + 1.5;
  const urlBoxX = x + pad;
  const urlBoxW = width - pad * 2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...TABLE_HEAD_INK);
  doc.setLineWidth(0.45);
  doc.roundedRect(urlBoxX, urlBoxY, urlBoxW, urlBoxH, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Parents verify results at', x + width / 2, urlBoxY + 4.2, { align: 'center' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(RESULT_CHECK_URL, x + width / 2, urlBoxY + 10.5, { align: 'center' });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, panelTop, width, panelH, 2, 2, 'S');

  return panelTop + panelH + 5;
}

function drawLetterheadBand(
  doc: jsPDF,
  opts: {
    org: string;
    orgWebsite: string;
    accentRgb: [number, number, number];
    logoDataUrl: string | null;
    dateStr: string;
    documentRef: string;
  },
): void {
  const { org, orgWebsite, accentRgb, logoDataUrl, dateStr, documentRef } = opts;
  const [r, g, b] = accentRgb;
  const rightX = PAGE_WIDTH - PAGE_MARGIN;
  const metaX = rightX - 46;
  const accentRuleH = 1.2;
  const bodyTop = accentRuleH;

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PAGE_WIDTH, accentRuleH, 'F');

  doc.setFillColor(255, 255, 255);
  doc.rect(0, bodyTop, PAGE_WIDTH, HEADER_BAND_H - accentRuleH, 'F');

  doc.setDrawColor(...TABLE_HEAD_RULE);
  doc.setLineWidth(0.35);
  doc.line(PAGE_MARGIN, HEADER_BAND_H, PAGE_WIDTH - PAGE_MARGIN, HEADER_BAND_H);

  const logoH = 24;
  const logoW = logoH * ROSTER_LOGO_ASPECT;
  const bandH = HEADER_BAND_H - accentRuleH;
  const brandMaxW = metaX - PAGE_MARGIN - logoW - 8;

  const titleLineH = 5.2;
  const orgLineH = 3.4;
  const siteLineH = 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(ROSTER_DOC_TAGLINE.toUpperCase(), brandMaxW);
  doc.setFontSize(8.5);
  const orgLines = doc.splitTextToSize(org, brandMaxW);
  const brandBlockH = titleLines.length * titleLineH + orgLines.length * orgLineH + siteLineH;
  const rowH = Math.max(logoH, brandBlockH);
  const rowTop = bodyTop + (bandH - rowH) / 2;

  const logoX = PAGE_MARGIN;
  const logoY = rowTop + (rowH - logoH) / 2;
  const brandX = logoX + logoW + 5;

  if (logoDataUrl) {
    try {
      doc.addImage(
        logoDataUrl,
        imageFormatFromDataUrl(logoDataUrl),
        logoX,
        logoY,
        logoW,
        logoH,
      );
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text('RC', logoX + logoW / 2, logoY + logoH / 2 + 1.5, { align: 'center' });
    }
  }

  const brandStartY = rowTop + (rowH - brandBlockH) / 2;
  let brandY = brandStartY + 3.8;

  doc.setTextColor(...accentRgb);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(titleLines, brandX, brandY);
  brandY += titleLines.length * titleLineH;

  doc.setTextColor(...INK);
  doc.setFontSize(8.5);
  doc.text(orgLines, brandX, brandY);
  brandY += orgLines.length * orgLineH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(orgWebsite, brandX, brandY);

  const badgeW = 38;
  const badgeX = rightX - badgeW;
  const metaBlockH = 18;
  const metaTop = rowTop + (rowH - metaBlockH) / 2;
  const badgeY = metaTop;
  doc.setDrawColor(...TABLE_HEAD_INK);
  doc.setLineWidth(0.35);
  doc.roundedRect(badgeX, badgeY, badgeW, 8, 0.8, 0.8, 'S');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('OFFICIAL DOCUMENT', badgeX + badgeW / 2, badgeY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...MUTED);
  doc.text(dateStr, rightX, metaTop + 10, { align: 'right' });
  doc.text(documentRef, rightX, metaTop + 14.5, { align: 'right' });
}

function drawOfficialRosterHeader(
  doc: jsPDF,
  opts: {
    org: string;
    orgWebsite: string;
    accentRgb: [number, number, number];
    logoDataUrl: string | null;
    className: string;
    sectionName?: string;
    studentCount: number;
    dateStr: string;
    documentRef: string;
    showInstructions: boolean;
  },
): number {
  const {
    org, orgWebsite, accentRgb, logoDataUrl, className, sectionName,
    studentCount, dateStr, documentRef, showInstructions,
  } = opts;
  const contentW = PAGE_WIDTH - PAGE_MARGIN * 2;

  drawLetterheadBand(doc, { org, orgWebsite, accentRgb, logoDataUrl, dateStr, documentRef });

  let y = HEADER_BAND_H + 6;

  y = drawClassMetaPanel(doc, PAGE_MARGIN, y, contentW, accentRgb, {
    className,
    sectionName,
    studentCount,
  });

  if (showInstructions) {
    const instructionLabel = sectionName ? `${className} · ${sectionName}` : className;
    y = drawInstructionsPanel(doc, PAGE_MARGIN, y, contentW, accentRgb, instructionLabel);
  }

  doc.setDrawColor(...TABLE_HEAD_RULE);
  doc.setLineWidth(0.35);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 4;

  return y;
}

function drawContinuationStrip(
  doc: jsPDF,
  _accentRgb: [number, number, number],
  org: string,
  continuationLabel: string,
) {
  const stripH = 9;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_WIDTH, stripH, 'F');
  doc.setDrawColor(...TABLE_HEAD_RULE);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, stripH, PAGE_WIDTH - PAGE_MARGIN, stripH);
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.text(org, PAGE_MARGIN, 5.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(continuationLabel, PAGE_WIDTH - PAGE_MARGIN, 5.8, { align: 'right' });
}

function drawPageFooter(
  doc: jsPDF,
  pageNumber: number,
  totalPages: number,
  org: string,
  orgWebsite: string,
  accentRgb: [number, number, number],
) {
  const footerTop = PAGE_HEIGHT - FOOTER_RESERVE;
  const lineY = footerTop + 2;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, lineY, PAGE_WIDTH - PAGE_MARGIN, lineY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(`${org} · ${orgWebsite}`, PAGE_MARGIN, lineY + 5);
  doc.text(`Verify results at ${RESULT_CHECK_URL}`, PAGE_MARGIN, lineY + 9);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.text(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - PAGE_MARGIN, lineY + 7, { align: 'right' });
}

function renderClassTable(
  doc: jsPDF,
  autoTable: (doc: jsPDF, options: Record<string, unknown>) => void,
  group: RosterPdfGroup,
  startY: number,
  hideClassColumn: boolean,
  accentRgb: [number, number, number],
  org: string,
) {
  const groupStartPage = doc.getNumberOfPages();
  const contentW = PAGE_WIDTH - PAGE_MARGIN * 2;
  const body = group.rows.map((row, index) => (
    hideClassColumn
      ? [index + 1, row.name, formatRosterSectionDisplay(row.section), row.rcDisplay]
      : [index + 1, row.name, row.className || '—', formatRosterSectionDisplay(row.section), row.rcDisplay]
  ));

  const continuationLabel = group.subtitle
    ? `${group.subtitle} · ${group.label} (continued)`
    : `${group.label} (continued)`;

  autoTable(doc, {
    startY,
    head: [hideClassColumn
      ? ['#', 'Student Name', 'Section', 'RC Number']
      : ['#', 'Student Name', 'Class', 'Section', 'RC Number']],
    body,
    theme: 'plain',
    showHead: 'everyPage',
    headStyles: {
      fillColor: TABLE_HEAD_BG,
      textColor: TABLE_HEAD_INK,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      lineColor: TABLE_HEAD_RULE,
      lineWidth: 0.15,
    },
    styles: {
      fontSize: 9,
      cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
      overflow: 'ellipsize',
      lineColor: BORDER,
      lineWidth: 0.12,
      textColor: INK,
      valign: 'middle',
      minCellHeight: 7,
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: hideClassColumn
      ? {
          0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: MUTED },
          1: { cellWidth: contentW - 10 - 22 - 48 },
          2: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: MUTED, overflow: 'ellipsize' },
          3: {
            cellWidth: 48,
            font: 'courier',
            fontStyle: 'bold',
            halign: 'center',
            fillColor: [255, 255, 255],
            textColor: TABLE_HEAD_INK,
            fontSize: 9.5,
            lineColor: TABLE_HEAD_RULE,
            lineWidth: 0.2,
          },
        }
      : {
          0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: MUTED },
          1: { cellWidth: contentW - 10 - 28 - 22 - 48 },
          2: { cellWidth: 28, textColor: MUTED, overflow: 'ellipsize' },
          3: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: MUTED, overflow: 'ellipsize' },
          4: {
            cellWidth: 48,
            font: 'courier',
            fontStyle: 'bold',
            halign: 'center',
            fillColor: [255, 255, 255],
            textColor: TABLE_HEAD_INK,
            fontSize: 9.5,
            lineColor: TABLE_HEAD_RULE,
            lineWidth: 0.2,
          },
        },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 12, bottom: FOOTER_RESERVE },
    didDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber > groupStartPage) {
        drawContinuationStrip(doc, accentRgb, org, continuationLabel);
      }
    },
  });

  const finalY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;
  const sigY = Math.min(finalY + 6, PAGE_HEIGHT - FOOTER_RESERVE - 8);
  if (sigY < PAGE_HEIGHT - FOOTER_RESERVE - 4) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(ROSTER_LEGACY_NOTE, PAGE_MARGIN, sigY, { maxWidth: contentW });

    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.line(PAGE_MARGIN, sigY + 4, PAGE_WIDTH - PAGE_MARGIN, sigY + 4);
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(`${ROSTER_SIGNATURE_LABEL}: ________________________________    Date: ____________`, PAGE_MARGIN, sigY + 9);
  }
}

/** A4 PDF table: student name, class, section, RC number — for class teachers / parents. */
export async function downloadStudentRosterPdf(
  rows: StudentRosterRow[],
  options: StudentRosterPdfOptions,
): Promise<boolean> {
  if (!rows.length) return false;

  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const org = formatOrgDisplay(options.orgName);
  const orgWebsite = formatWebsiteDisplay(options.orgWebsite);
  const accentRgb = hexToRgb(options.accentColor);
  const logoDataUrl = await loadRosterLogoDataUrl(options.origin);

  doc.setProperties({
    title: options.title || 'Official RC Roster',
    subject: 'Student result verification roster',
    author: org,
    creator: 'Rillcod Technologies',
  });

  const pdfGroups: RosterPdfGroup[] = options.pdfGroups && options.pdfGroups.length > 0
    ? options.pdfGroups
    : options.classGroups && options.classGroups.length > 0
      ? options.classGroups.map((g) => ({ label: g.className, rows: g.rows }))
      : buildRosterPdfGroups(rows, options.groupMode ?? 'class');

  const hideClassColumn = pdfGroups.length > 0;

  pdfGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) doc.addPage();

    const className = group.subtitle || group.label;
    const sectionName = group.subtitle ? group.label : undefined;
    const dateIso = new Date().toISOString().slice(0, 10);

    const tableStartY = drawOfficialRosterHeader(doc, {
      org,
      orgWebsite,
      accentRgb,
      logoDataUrl,
      className,
      sectionName,
      studentCount: group.rows.length,
      dateStr,
      documentRef: rosterDocumentRef(className, dateIso),
      showInstructions: true,
    });

    renderClassTable(doc, autoTable, group, tableStartY, hideClassColumn, accentRgb, org);
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawPageFooter(doc, page, totalPages, org, orgWebsite, accentRgb);
  }

  const slug = options.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'roster';
  const filename = options.filename || `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (options.mode === 'print') {
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    const win = window.open(blobUrl, '_blank');
    if (!win) return false;
    win.focus();
    return true;
  }

  doc.save(filename);
  return true;
}
