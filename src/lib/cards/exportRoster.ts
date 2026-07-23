import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';

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
      const sectionCmp = (a.section || 'zzz').localeCompare(b.section || 'zzz');
      if (sectionCmp !== 0) return sectionCmp;
      const classCmp = (a.className || 'zzz').localeCompare(b.className || 'zzz');
      if (classCmp !== 0) return classCmp;
      return a.name.localeCompare(b.name);
    });
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

function rosterTableHtml(rows: StudentRosterRow[], sectionLabel?: string) {
  const body = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.className || '—')}</td>
      <td>${escapeHtml(row.section || '—')}</td>
      <td class="mono">${escapeHtml(row.rcDisplay)}</td>
    </tr>
  `).join('');

  return `
    ${sectionLabel ? `<h2>${escapeHtml(sectionLabel)}</h2>` : ''}
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Student Name</th>
          <th>Class</th>
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
  groupedBySection?: Map<string, StudentRosterRow[]>,
) {
  const sections = groupedBySection && groupedBySection.size > 0
    ? Array.from(groupedBySection.entries()).sort(([a], [b]) => a.localeCompare(b))
    : null;

  const tables = sections
    ? sections.map(([section, sectionRows]) => rosterTableHtml(sectionRows, section)).join('')
    : rosterTableHtml(rows);

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
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    td.mono, th:last-child { font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: 0.04em; }
    .foot { margin-top: 18px; font-size: 10px; color: #666; line-height: 1.5; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${rows.length} student${rows.length === 1 ? '' : 's'} · Parents enter RC number at rillcod.com/result-check</p>
  ${tables}
  <p class="foot">
    Share each child's RC number with their parent. They can open the coding report at
    <strong>rillcod.com/result-check</strong> and type the 8-digit number (with or without a dash).
  </p>
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
};

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

  doc.setFontSize(18);
  doc.setTextColor(26, 58, 143);
  doc.text(org, 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text('Student RC Number Roster', 14, 25);
  doc.setFontSize(9);
  doc.text(options.title, 14, 31);
  doc.text(`Generated: ${dateStr}`, 196, 18, { align: 'right' });
  doc.text(`${rows.length} student${rows.length === 1 ? '' : 's'}`, 196, 24, { align: 'right' });

  doc.setDrawColor(210);
  doc.line(14, 34, 196, 34);

  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text('Parents open rillcod.com/result-check and enter the 8-digit RC number.', 14, 39);

  doc.setFontSize(7.5);
  doc.setTextColor(40);
  const teacherNote = [
    'FOR CLASS TEACHER (one message only — do not enter details for each parent):',
    '1. Send this PDF or list to the class WhatsApp group.',
    '2. Each parent opens rillcod.com/result-check on their own phone.',
    '3. Parent enters their child\'s RC number + child\'s name — report opens automatically.',
  ];
  teacherNote.forEach((line, i) => doc.text(line, 14, 44 + i * 4));

  const body = rows.map((row, index) => [
    index + 1,
    row.name,
    row.className || '—',
    row.section || '—',
    row.rcDisplay,
  ]);

  autoTable(doc, {
    startY: 60,
    head: [['#', 'Student Name', 'Class', 'Section', 'RC Number']],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [26, 58, 143],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 62 },
      2: { cellWidth: 28 },
      3: { cellWidth: 38 },
      4: { cellWidth: 32, font: 'courier', fontStyle: 'bold', halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(7);
  doc.setTextColor(130);
  doc.text(
    'Share each RC number with the parent. They can view the coding report at rillcod.com/result-check.',
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
