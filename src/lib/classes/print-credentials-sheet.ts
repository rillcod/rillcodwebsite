import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import { openPrintWindow } from '@/lib/cards/printCard';

export type CredentialSheetStudent = {
  id: string;
  full_name: string;
  grade?: string | null;
  email?: string | null;
  temp_password?: string | null;
};

function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCredentialsHtml(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
  autoPrint?: boolean;
}): string {
  const originHost = typeof window !== 'undefined'
    ? window.location.origin.replace(/^https?:\/\//, '')
    : 'rillcod.com';
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const rowsHtml = input.students
    .map((s, idx) => {
      const rcDisplay = formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id));
      return `
      <tr>
        <td class="num">${idx + 1}</td>
        <td>
          <div class="name">${esc(s.full_name)}</div>
          <div class="meta">${esc(s.grade || '—')}</div>
        </td>
        <td class="mono">${esc(s.email || '—')}</td>
        <td class="mono pw">${esc(s.temp_password || 'Not archived — tap Generate')}</td>
        <td class="mono rc">${esc(rcDisplay)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Student Login, Password & RC List — ${esc(input.className)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Inter, system-ui, sans-serif; color: #111827; margin: 0; font-size: 11px; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3A8F; padding-bottom: 8px; margin-bottom: 10px; }
    .hdr h1 { margin: 0; font-size: 16px; color: #1A3A8F; letter-spacing: -0.01em; }
    .hdr p { margin: 2px 0 0; color: #4b5563; font-size: 10px; }
    .guide { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 10px; }
    .guide strong { color: #1A3A8F; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1A3A8F; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: middle; }
    tr:nth-child(even) td { background: #f9fafb; }
    .num { width: 26px; text-align: center; color: #6b7280; font-weight: 700; }
    .name { font-weight: 700; color: #111827; font-size: 11.5px; }
    .meta { font-size: 9.5px; color: #6b7280; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
    .pw { font-weight: 700; color: #047857; }
    .rc { font-weight: 800; color: #1A3A8F; }
    .foot { margin-top: 10px; font-size: 9.5px; color: #6b7280; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>Student Username, Password &amp; Result RC List</h1>
      <p><strong>${esc(input.className)}</strong>${input.schoolName ? ` · ${esc(input.schoolName)}` : ''} · ${input.students.length} student${input.students.length === 1 ? '' : 's'}</p>
    </div>
    <p>Printed ${esc(today)}</p>
  </div>
  <div class="guide">
    <div><strong>Student Portal Login:</strong> Visit <strong>${esc(originHost)}/login</strong> and enter the Username (Email) &amp; Password below.</div>
    <div><strong>Result Check:</strong> Visit <strong>${esc(originHost)}/result-check</strong> and enter the RC Number below.</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Student &amp; Grade</th>
        <th>Username (Email)</th>
        <th>Password</th>
        <th>Result RC Number</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot">
    <span>Choose "Save as PDF" in the print dialog to save a PDF copy.</span>
    <span>${esc(originHost)}</span>
  </div>
  ${input.autoPrint !== false ? '<script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>' : ''}
</body>
</html>`;
}

/**
 * Opens a clean A4 printable sheet showing EVERY student's Username (Email),
 * Password, and Result Check RC Number — falls back to a hidden print iframe
 * if pop-ups are blocked so printing always works on phones and desktops.
 */
export function openClassCredentialsPrintSheet(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
}): boolean {
  if (!input.students.length || typeof window === 'undefined') return false;
  const html = buildCredentialsHtml({ ...input, autoPrint: true });
  const win = window.open('', '_blank');
  if (win) {
    openPrintWindow(html, win);
    return true;
  }

  // Fallback when pop-ups are blocked: print cleanly via hidden iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return false;
    }
    doc.open();
    doc.write(buildCredentialsHtml({ ...input, autoPrint: false }));
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1500);
    }, 250);
    return true;
  } catch {
    return false;
  }
}

/**
 * Direct 1-click A4 PDF download (jsPDF) of every student's Username (Email),
 * Password, and Result RC Number — works on every phone/desktop with zero pop-ups
 * and zero requirement for published results.
 */
export async function downloadClassCredentialsPdf(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
}): Promise<boolean> {
  if (!input.students.length || typeof window === 'undefined') return false;
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const originHost = window.location.origin.replace(/^https?:\/\//, '');
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const colNum = margin;
  const colName = margin + 9;
  const colEmail = margin + 62;
  const colPass = margin + 124;
  const colRc = margin + 157;

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(26, 58, 143);
    doc.rect(margin, 10, contentW, 13, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Student Username, Password & Result RC List', margin + 4, 16.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const sub = `${input.className}${input.schoolName ? ` · ${input.schoolName}` : ''} · ${input.students.length} students`;
    doc.text(sub.slice(0, 95), margin + 4, 21);
    doc.text(`Printed ${today} · Page ${pageNum}`, pageW - margin - 4, 16.5, { align: 'right' });

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, 25, contentW, 8, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.text(`Portal Login: ${originHost}/login   |   Result Check: ${originHost}/result-check`, margin + 3, 30);

    // Table header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, 35, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(26, 58, 143);
    doc.text('#', colNum + 2, 39.7);
    doc.text('STUDENT & GRADE', colName, 39.7);
    doc.text('USERNAME (EMAIL)', colEmail, 39.7);
    doc.text('PASSWORD', colPass, 39.7);
    doc.text('RESULT RC', colRc, 39.7);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 42, pageW - margin, 42);
  };

  let pageNum = 1;
  drawHeader(pageNum);
  let y = 47;
  const rowH = 8.5;

  input.students.forEach((s, idx) => {
    if (y + rowH > pageH - 14) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum);
      y = 47;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y - 4.8, contentW, rowH, 'F');
    }

    const rcDisplay = formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text(String(idx + 1), colNum + 2, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    const nameLine = s.grade ? `${s.full_name} (${s.grade})` : s.full_name;
    doc.text(nameLine.slice(0, 30), colName, y);

    doc.setFont('courier', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text((s.email || '—').slice(0, 34), colEmail, y);

    doc.setFont('courier', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text((s.temp_password || '—').slice(0, 18), colPass, y);

    doc.setFont('courier', 'bold');
    doc.setTextColor(26, 58, 143);
    doc.text(rcDisplay, colRc, y);

    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y + 3.5, pageW - margin, y + 3.5);
    y += rowH;
  });

  const slug = input.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'class';
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`${slug}-login-password-rc-${dateStr}.pdf`);
  return true;
}
