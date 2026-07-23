import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
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
export const ROSTER_TEACHER_STEPS = [
  'Print or download this roster once (Print PDF / Download in Card Studio).',
  'Share the PDF in the class WhatsApp group — or print and send home.',
  'Each parent finds their child\'s RC number in the list below.',
  'You do not enter anything for parents — they verify on their own phones.',
] as const;

export const ROSTER_PARENT_STEPS = [
  'Open rillcod.com/result-check on your phone.',
  'Enter your child\'s RC number from this list (8 digits on new cards; letters on older cards).',
  'Enter your name, email, and phone — then the 6-digit code sent to your email.',
  'The coding report opens on the same page. Portal login details are emailed to you.',
] as const;

export const ROSTER_LEGACY_NOTE =
  'Older access cards may show letter codes (e.g. RC-AB12-CD34) or work by QR scan only — all formats are accepted.';

/** Sort class names (JSS 1, JSS 2, SS 1…) before plain alphabetical. */
export function compareClassNames(a: string, b: string): number {
  const rank = (raw: string) => {
    const s = raw.trim();
    const m = s.match(/^(JSS|SS|PRY|KG|NUR)\s*(\d+)/i);
    if (m) {
      const band = { NUR: -20, KG: -10, PRY: 0, JSS: 100, SS: 200 }[m[1].toUpperCase()] ?? 50;
      return band + parseInt(m[2], 10);
    }
    return 900;
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
      const sectionCmp = (a.section || 'zzz').localeCompare(b.section || 'zzz');
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
      <td>${index + 1}</td>
      <td>${escapeHtml(row.name)}</td>
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
          <th>#</th>
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
) {
  const groups = groupedByClass && groupedByClass.length > 0
    ? groupedByClass
    : [{ className: '', rows }];

  const tables = groups.map((group, index) => `
    <div class="grade-block${index > 0 ? ' grade-break' : ''}">
      ${rosterTableHtml(group.rows, {
        classLabel: group.className ? `Class: ${group.className} (${group.rows.length} student${group.rows.length === 1 ? '' : 's'})` : undefined,
        hideClassColumn: !!group.className,
      })}
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; color: #111; margin: 16mm; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { font-size: 11px; color: #666; margin-bottom: 16px; }
    h2 { font-size: 13px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }
    .grade-block { margin-bottom: 8px; }
    .grade-break { break-before: page; page-break-before: always; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    td.mono, th:last-child { font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: 0.04em; }
    .foot { margin-top: 18px; font-size: 10px; color: #444; line-height: 1.55; }
    .foot ol { margin: 6px 0 0 18px; padding: 0; }
    .foot li { margin-bottom: 4px; }
    @media print {
      body { margin: 10mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${rows.length} student${rows.length === 1 ? '' : 's'} · Holiday result check at rillcod.com/result-check · one page set per class</p>
  ${tables}
  <div class="foot">
    <p><strong>For class teachers</strong></p>
    <ol>${ROSTER_TEACHER_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    <p style="margin-top:12px"><strong>For parents</strong></p>
    <ol>${ROSTER_PARENT_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    <p style="margin-top:12px;font-style:italic">${escapeHtml(ROSTER_LEGACY_NOTE)}</p>
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
  /** @deprecated Prefer pdfGroups */
  classGroups?: RosterClassGroup[];
  pdfGroups?: RosterPdfGroup[];
  /** How to split pages when pdfGroups/classGroups not provided. */
  groupMode?: 'class' | 'section';
};

function drawClassPdfHeader(
  doc: jsPDF,
  opts: {
    org: string;
    title: string;
    className: string;
    sectionName?: string;
    studentCount: number;
    dateStr: string;
    showFullInstructions: boolean;
  },
): number {
  const { org, title, className, sectionName, studentCount, dateStr, showFullInstructions } = opts;

  doc.setFontSize(18);
  doc.setTextColor(26, 58, 143);
  doc.text(org, 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text('Student RC Number Roster', 14, 25);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 58, 143);
  if (sectionName) {
    doc.text(`Section: ${sectionName}`, 14, 32);
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.setFont('helvetica', 'normal');
    doc.text(`Class: ${className}`, 14, 38);
    doc.text(title, 14, 44);
  } else {
    doc.text(`Class: ${className}`, 14, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(title, 14, 38);
  }
  doc.text(`Generated: ${dateStr}`, 196, 18, { align: 'right' });
  doc.text(`${studentCount} student${studentCount === 1 ? '' : 's'}`, 196, 24, { align: 'right' });

  const ruleY = sectionName ? 47 : 41;
  doc.setDrawColor(210);
  doc.line(14, ruleY, 196, ruleY);

  let y = ruleY + 5;
  if (showFullInstructions) {
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text('Holiday results: parents use rillcod.com/result-check (see steps below).', 14, y);
    y += 5;

    doc.setFontSize(7.2);
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text('FOR CLASS TEACHER — one message only:', 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    ROSTER_TEACHER_STEPS.forEach((line, i) => {
      doc.text(`${i + 1}. ${line}`, 14, y + i * 3.6);
    });
    y += ROSTER_TEACHER_STEPS.length * 3.6 + 2;

    doc.setFont('helvetica', 'bold');
    doc.text('FOR PARENTS — each RC number is in the table:', 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    ROSTER_PARENT_STEPS.forEach((line, i) => {
      doc.text(`${i + 1}. ${line}`, 14, y + i * 3.6);
    });
    y += ROSTER_PARENT_STEPS.length * 3.6 + 6;
  } else {
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text('Class roster (continued) · rillcod.com/result-check', 14, y);
    y += 8;
  }

  return y;
}

function renderClassTable(
  doc: jsPDF,
  autoTable: (doc: jsPDF, options: Record<string, unknown>) => void,
  group: RosterPdfGroup,
  startY: number,
  hideClassColumn: boolean,
) {
  const groupStartPage = doc.getNumberOfPages();
  const body = group.rows.map((row, index) => (
    hideClassColumn
      ? [index + 1, row.name, row.section || '—', row.rcDisplay]
      : [index + 1, row.name, row.className || '—', row.section || '—', row.rcDisplay]
  ));

  const continuationLabel = group.subtitle
    ? `Section: ${group.label} · Class: ${group.subtitle} (continued)`
    : `Class: ${group.label} (continued)`;

  autoTable(doc, {
    startY,
    head: [hideClassColumn
      ? ['#', 'Student Name', 'Section', 'RC Number']
      : ['#', 'Student Name', 'Class', 'Section', 'RC Number']],
    body,
    theme: 'grid',
    showHead: 'everyPage',
    headStyles: {
      fillColor: [26, 58, 143],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: hideClassColumn
      ? {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 78 },
          2: { cellWidth: 42 },
          3: { cellWidth: 40, font: 'courier', fontStyle: 'bold', halign: 'center' },
        }
      : {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 62 },
          2: { cellWidth: 28 },
          3: { cellWidth: 38 },
          4: { cellWidth: 32, font: 'courier', fontStyle: 'bold', halign: 'center' },
        },
    margin: { left: 14, right: 14, top: 22 },
    didDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber > groupStartPage) {
        doc.setFontSize(8);
        doc.setTextColor(60);
        doc.setFont('helvetica', 'bold');
        doc.text(continuationLabel, 14, 10);
        doc.setFont('helvetica', 'normal');
      }
    },
  });
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const org = options.orgName || 'RILLCOD TECHNOLOGIES';

  const pdfGroups: RosterPdfGroup[] = options.pdfGroups && options.pdfGroups.length > 0
    ? options.pdfGroups
    : options.classGroups && options.classGroups.length > 0
      ? options.classGroups.map((g) => ({ label: g.className, rows: g.rows }))
      : buildRosterPdfGroups(rows, options.groupMode ?? 'class');

  const hideClassColumn = pdfGroups.length > 0;

  pdfGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) doc.addPage();

    const tableStartY = drawClassPdfHeader(doc, {
      org,
      title: options.title,
      className: group.subtitle || group.label,
      sectionName: group.subtitle ? group.label : undefined,
      studentCount: group.rows.length,
      dateStr,
      showFullInstructions: groupIndex === 0,
    });

    renderClassTable(doc, autoTable, group, tableStartY, hideClassColumn);
  });

  const finalY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(7);
  doc.setTextColor(130);
  doc.text(
    `${ROSTER_LEGACY_NOTE} Share each RC number with the matching parent.`,
    105,
    Math.min(finalY + 12, 285),
    { align: 'center' },
  );

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
