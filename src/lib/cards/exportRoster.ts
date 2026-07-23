import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import { parseGrade } from '@/lib/classes/naming';
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
      <td>${escapeHtml(row.section || '—')}</td>
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
      background: ${accent}; color: #fff;
      padding: 10mm 12mm 8mm;
      border-radius: 6px 6px 0 0;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
    }
    .letterhead-brand h1 { font-size: 16px; margin: 0 0 3px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 800; line-height: 1.2; }
    .letterhead-brand .site { font-size: 11px; opacity: 0.92; margin: 0; font-weight: 600; }
    .letterhead-meta { text-align: right; font-size: 10px; line-height: 1.5; opacity: 0.92; }
    .badge {
      display: inline-block;
      background: #fff; color: ${accent};
      font-size: 8px; font-weight: 800; letter-spacing: 0.1em;
      padding: 5px 9px; border-radius: 4px; margin-bottom: 6px;
    }
    .doc-body { border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px; padding: 12mm 12mm 10mm; }
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
      background: #fff; border: 1px dashed ${accent}; border-radius: 5px;
      padding: 8px 10px; text-align: center;
    }
    .info-panel .url-box .label { margin-bottom: 4px; }
    .info-panel .url-box .url { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 800; color: ${accent}; letter-spacing: 0.02em; }
    .instructions { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
    .instructions-head { background: ${accent}; color: #fff; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 7px 12px; text-transform: uppercase; }
    .instructions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; background: #f9fafb; }
    .instructions-grid section { padding: 10px 12px; font-size: 10px; line-height: 1.5; color: #4b5563; }
    .instructions-grid h3 { margin: 0 0 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #111827; font-weight: 800; }
    .instructions-note { margin: 0 0 6px; font-size: 9px; line-height: 1.45; color: #6b7280; font-style: italic; }
    .instructions-grid ol { margin: 0; padding-left: 16px; }
    .instructions-grid li { margin-bottom: 4px; }
    .grade-block { margin-bottom: 8px; }
    .grade-break { break-before: page; page-break-before: always; }
    .class-banner { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; }
    .class-label { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: ${accent}; }
    .class-name { font-size: 13px; font-weight: 700; color: #111827; }
    .class-count { margin-left: auto; font-size: 10px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: middle; }
    th { background: ${accent}; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    td.mono { font-family: ui-monospace, "Cascadia Code", monospace; font-weight: 800; letter-spacing: 0.08em; color: ${accent}; background: #eef2ff; text-align: center; font-size: 11px; }
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
      <div class="letterhead-brand">
        <h1>${escapeHtml(org)}</h1>
        <p class="site">${escapeHtml(orgWebsite)}</p>
      </div>
      <div class="letterhead-meta">
        <div class="badge">Official Document</div>
        <div>Generated ${escapeHtml(dateStr)}</div>
        <div>${rows.length} student${rows.length === 1 ? '' : 's'}</div>
      </div>
    </header>

    <div class="doc-body">
      <div class="doc-title">
        <h2>Holiday Result Check</h2>
        <p>Official RC Roster · Student Result Verification</p>
      </div>

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
const HEADER_BAND_H = 26;
const FOOTER_RESERVE = 18;
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];
const PANEL_BG: [number, number, number] = [249, 250, 251];
const ZEBRA: [number, number, number] = [248, 250, 252];

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

async function loadRosterLogoDataUrl(origin?: string): Promise<string | null> {
  if (typeof window === 'undefined' || !origin) return null;
  const base = origin.replace(/\/$/, '');
  for (const path of ['/logo.png', '/images/logo.png']) {
    try {
      const res = await fetch(`${base}${path}`, { cache: 'force-cache' });
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) return dataUrl;
    } catch {
      /* try next path */
    }
  }
  return null;
}

function rosterInstructionsHtml(classLabel: string, accent: string) {
  return `
    <div class="instructions">
      <div class="instructions-head">Distribution guide — ${escapeHtml(classLabel)}</div>
      <div class="instructions-grid">
        <section>
          <h3>${escapeHtml(ROSTER_EDUCATOR_HEADING)}</h3>
          <p class="instructions-note">${escapeHtml(ROSTER_EDUCATOR_NOTE)}</p>
          <ol>${ROSTER_EDUCATOR_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
        </section>
        <section>
          <h3>${escapeHtml(ROSTER_PARENT_HEADING)}</h3>
          <ol>${ROSTER_PARENT_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
        </section>
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
  const [r, g, b] = accentRgb;
  const colW = (width - 10) / 2;
  const leftX = x + 5;
  const rightX = x + 5 + colW;
  const lineH = 3.6;
  const headerH = 8;
  const bodyFont = 7;
  const noteFont = 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFont);

  let leftY = 5;
  doc.setFontSize(noteFont);
  leftY += doc.splitTextToSize(ROSTER_EDUCATOR_NOTE, colW - 2).length * 3 + 2;
  doc.setFontSize(bodyFont);
  ROSTER_EDUCATOR_STEPS.forEach((line, i) => {
    leftY += doc.splitTextToSize(`${i + 1}. ${line}`, colW - 2).length * lineH;
  });
  let rightY = 5;
  ROSTER_PARENT_STEPS.forEach((line, i) => {
    rightY += doc.splitTextToSize(`${i + 1}. ${line}`, colW - 2).length * lineH;
  });

  const contentH = Math.max(leftY, rightY) + 6;
  const panelH = headerH + contentH;
  const panelTop = y;

  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, panelTop, width, panelH, 1.5, 1.5, 'FD');

  doc.setFillColor(r, g, b);
  doc.rect(x, panelTop, width, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`Distribution guide — ${classLabel}`, x + 5, panelTop + 5.5);

  let ly = panelTop + headerH + 5;
  let ry = panelTop + headerH + 5;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(bodyFont);
  doc.text(ROSTER_EDUCATOR_HEADING, leftX, ly);
  doc.text(ROSTER_PARENT_HEADING, rightX, ry);
  ly += 4;
  ry += 4;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(noteFont);
  doc.setTextColor(...MUTED);
  const noteLines = doc.splitTextToSize(ROSTER_EDUCATOR_NOTE, colW - 2);
  doc.text(noteLines, leftX, ly);
  ly += noteLines.length * 3 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFont);
  doc.setTextColor(...INK);
  ROSTER_EDUCATOR_STEPS.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, colW - 2);
    doc.text(wrapped, leftX, ly);
    ly += wrapped.length * lineH;
  });
  ROSTER_PARENT_STEPS.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, colW - 2);
    doc.text(wrapped, rightX, ry);
    ry += wrapped.length * lineH;
  });

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

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PAGE_WIDTH, HEADER_BAND_H, 'F');
  doc.setFillColor(Math.min(255, r + 20), Math.min(255, g + 20), Math.min(255, b + 20));
  doc.rect(0, HEADER_BAND_H, PAGE_WIDTH, 0.8, 'F');

  const brandX = logoDataUrl ? PAGE_MARGIN + 20 : PAGE_MARGIN;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, 4.5, 16, 16);
    } catch {
      /* logo optional */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const orgLines = doc.splitTextToSize(org, 95);
  doc.text(orgLines, brandX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(orgWebsite, brandX, 11 + orgLines.length * 4.2 + 1);

  const badgeW = 42;
  const badgeX = rightX - badgeW;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(badgeX, 5, badgeW, 9, 1.5, 1.5, 'F');
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('OFFICIAL DOCUMENT', badgeX + badgeW / 2, 11.2, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(dateStr, rightX, 17, { align: 'right' });
  doc.text(documentRef, rightX, 21.5, { align: 'right' });
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
  const [r, g, b] = accentRgb;
  const contentW = PAGE_WIDTH - PAGE_MARGIN * 2;

  drawLetterheadBand(doc, { org, orgWebsite, accentRgb, logoDataUrl, dateStr, documentRef });

  let y = HEADER_BAND_H + 8;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Holiday Result Check', PAGE_MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Official RC Roster · Student Result Verification', PAGE_MARGIN, y);
  y += 8;

  const panelH = sectionName ? 22 : 18;
  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(PAGE_MARGIN, y, contentW, panelH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(`Class: ${className}`, PAGE_MARGIN + 4, y + 6);
  if (sectionName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Section: ${sectionName}`, PAGE_MARGIN + 4, y + 11.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(r, g, b);
  const metaX = PAGE_WIDTH - PAGE_MARGIN - 4;
  doc.text(`${studentCount} student${studentCount === 1 ? '' : 's'}`, metaX, y + 6, { align: 'right' });

  const urlY = sectionName ? y + 17 : y + 13;
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.15);
  doc.line(PAGE_MARGIN + 4, urlY - 3.5, PAGE_WIDTH - PAGE_MARGIN - 4, urlY - 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Parents verify results at', PAGE_MARGIN + 4, urlY);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(r, g, b);
  doc.text(RESULT_CHECK_URL, metaX, urlY, { align: 'right' });

  y += panelH + 5;

  if (showInstructions) {
    const instructionLabel = sectionName ? `${className} · ${sectionName}` : className;
    y = drawInstructionsPanel(doc, PAGE_MARGIN, y, contentW, accentRgb, instructionLabel);
  }

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 4;

  return y;
}

function drawContinuationStrip(
  doc: jsPDF,
  accentRgb: [number, number, number],
  org: string,
  continuationLabel: string,
) {
  const [r, g, b] = accentRgb;
  const stripH = 10;
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PAGE_WIDTH, stripH, 'F');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(org, PAGE_MARGIN, 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(continuationLabel, PAGE_WIDTH - PAGE_MARGIN, 6.5, { align: 'right' });
}

function drawPageFooter(
  doc: jsPDF,
  pageNumber: number,
  totalPages: number,
  org: string,
  orgWebsite: string,
  accentRgb: [number, number, number],
) {
  const [r, g, b] = accentRgb;
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

  doc.setTextColor(r, g, b);
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
  const rcTint = tintRgb(accentRgb, 0.94);
  const contentW = PAGE_WIDTH - PAGE_MARGIN * 2;
  const body = group.rows.map((row, index) => (
    hideClassColumn
      ? [index + 1, row.name, row.section || '—', row.rcDisplay]
      : [index + 1, row.name, row.className || '—', row.section || '—', row.rcDisplay]
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
      fillColor: accentRgb,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      lineColor: accentRgb,
      lineWidth: 0.1,
    },
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      overflow: 'linebreak',
      lineColor: BORDER,
      lineWidth: 0.12,
      textColor: INK,
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: hideClassColumn
      ? {
          0: { cellWidth: 12, halign: 'center', fontStyle: 'bold', textColor: MUTED },
          1: { cellWidth: contentW - 12 - 40 - 46 },
          2: { cellWidth: 40, textColor: MUTED },
          3: {
            cellWidth: 46,
            font: 'courier',
            fontStyle: 'bold',
            halign: 'center',
            fillColor: rcTint,
            textColor: accentRgb,
            fontSize: 9.5,
          },
        }
      : {
          0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: MUTED },
          1: { cellWidth: contentW - 10 - 30 - 34 - 40 },
          2: { cellWidth: 30, textColor: MUTED },
          3: { cellWidth: 34, textColor: MUTED },
          4: {
            cellWidth: 40,
            font: 'courier',
            fontStyle: 'bold',
            halign: 'center',
            fillColor: rcTint,
            textColor: accentRgb,
            fontSize: 9.5,
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
    creator: 'Rillcod Academy',
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
