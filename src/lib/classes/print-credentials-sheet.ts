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
  includeRc?: boolean;
  autoPrint?: boolean;
}): string {
  const includeRc = input.includeRc === true;
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
      const rcCell = includeRc
        ? `<td class="mono rc">${esc(formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id)))}</td>`
        : '';
      return `
      <tr>
        <td class="num">${idx + 1}</td>
        <td>
          <div class="name">${esc(s.full_name)}</div>
          <div class="meta">${esc(s.grade || '—')}</div>
        </td>
        <td class="mono">${esc(s.email || '—')}</td>
        <td class="mono pw">${esc(s.temp_password || 'Not archived — tap Generate')}</td>
        ${rcCell}
      </tr>`;
    })
    .join('');

  const heading = includeRc
    ? 'Student Username, Password & Result RC List'
    : 'Student Portal Login List (Username & Password)';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(heading)} — ${esc(input.className)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Inter, system-ui, sans-serif; color: #111827; margin: 0; font-size: 11px; }
    .hdr { background: #1A3A8F; color: #fff; border-top: 4px solid #10b981; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .hdr-brand { font-size: 8.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #a7f3d0; margin-bottom: 3px; }
    .hdr h1 { margin: 0; font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; line-height: 1.25; }
    .hdr-sub { margin: 4px 0 0; color: #dbeafe; font-size: 10.5px; font-weight: 600; }
    .hdr-meta { text-align: right; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.22); padding-left: 14px; }
    .hdr-count { font-size: 12px; font-weight: 800; color: #a7f3d0; text-transform: uppercase; letter-spacing: 0.04em; }
    .hdr-date { margin-top: 3px; font-size: 9.5px; color: #e2e8f0; }
    .guide { display: grid; grid-template-columns: ${includeRc ? '1fr 1fr' : '1fr'}; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #1A3A8F; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 10px; }
    .guide strong { color: #1A3A8F; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; color: #1A3A8F; border-top: 1.5px solid #1A3A8F; border-bottom: 1.5px solid #cbd5e1; text-align: left; padding: 7px 8px; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
    td { border-bottom: 1px solid #e5e7eb; padding: 6.5px 8px; vertical-align: middle; }
    tr:nth-child(even) td { background: #f9fafb; }
    .num { width: 26px; text-align: center; color: #6b7280; font-weight: 700; }
    .name { font-weight: 700; color: #111827; font-size: 11.5px; }
    .meta { font-size: 9.5px; color: #6b7280; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
    .pw { font-weight: 700; color: #047857; }
    .rc { font-weight: 800; color: #1A3A8F; }
    .foot { margin-top: 12px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <div class="hdr-brand">Rillcod Academy · Official Student Credentials</div>
      <h1>${esc(heading)}</h1>
      <div class="hdr-sub">${esc(input.className)}${input.schoolName ? ` &nbsp;·&nbsp; ${esc(input.schoolName)}` : ''}</div>
    </div>
    <div class="hdr-meta">
      <div class="hdr-count">${input.students.length} Student${input.students.length === 1 ? '' : 's'}</div>
      <div class="hdr-date">Issued: ${esc(today)}</div>
    </div>
  </div>
  <div class="guide">
    <div><strong>Student Portal Login:</strong> Visit <strong>${esc(originHost)}/login</strong> and enter your Username (Email) &amp; Password below.</div>
    ${includeRc ? `<div><strong>Result Check:</strong> Visit <strong>${esc(originHost)}/result-check</strong> and enter the RC Number below.</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Student &amp; Grade</th>
        <th>Username (Email)</th>
        <th>Password</th>
        ${includeRc ? '<th>Result RC Number</th>' : ''}
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
 * Opens a clean A4 printable sheet showing EVERY student's Username (Email) & Password
 * (with optional Result Check RC Number when `includeRc: true`).
 * Falls back to a hidden print iframe if pop-ups are blocked.
 */
export function openClassCredentialsPrintSheet(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
  includeRc?: boolean;
}): boolean {
  if (!input.students.length || typeof window === 'undefined') return false;
  const html = buildCredentialsHtml({ ...input, autoPrint: true });
  const win = window.open('', '_blank');
  if (win) {
    openPrintWindow(html, win);
    return true;
  }

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
 * Direct 1-click A4 PDF download (jsPDF) of every student's Username (Email) & Password
 * (with optional Result RC Number when `includeRc: true`).
 */
export async function downloadClassCredentialsPdf(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
  includeRc?: boolean;
}): Promise<boolean> {
  if (!input.students.length || typeof window === 'undefined') return false;
  const includeRc = input.includeRc === true;
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

  const colNum = margin + 2;
  const colName = margin + 10;
  const colEmail = includeRc ? margin + 66 : margin + 76;
  const colPass = includeRc ? margin + 125 : margin + 144;
  const colRc = margin + 157;

  const heading = includeRc
    ? 'Student Login & Result RC List'
    : 'Student Portal Login List';

  const rowH = 8.5;
  const firstRowY = 58.5;
  const maxRowY = pageH - 16;
  const rowsPerPage = Math.max(1, Math.floor((maxRowY - firstRowY) / rowH) + 1);
  const totalPages = Math.max(1, Math.ceil(input.students.length / rowsPerPage));

  const fitText = (text: string, maxWidthMm: number): string => {
    const clean = String(text ?? '').trim() || '—';
    if (doc.getTextWidth(clean) <= maxWidthMm) return clean;
    let out = clean;
    while (out.length > 3 && doc.getTextWidth(`${out}…`) > maxWidthMm) {
      out = out.slice(0, -1);
    }
    return `${out}…`;
  };

  const drawHeader = (pageNum: number) => {
    // Executive Navy Header Card with Emerald Top Accent Stripe
    doc.setFillColor(26, 58, 143);
    doc.roundedRect(margin, 10, contentW, 23, 2.5, 2.5, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(margin, 10, contentW, 1.8, 'F');

    // Left Block: Brand Eyebrow + Document Title + Class & School Metadata
    const leftMaxW = contentW - 52;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(167, 243, 208);
    doc.text('RILLCOD ACADEMY  ·  OFFICIAL STUDENT CREDENTIALS', margin + 5, 16.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(255, 255, 255);
    doc.text(fitText(heading, leftMaxW), margin + 5, 22.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(219, 234, 254);
    const sub = `${input.className}${input.schoolName ? `  ·  ${input.schoolName}` : ''}`;
    doc.text(fitText(sub, leftMaxW), margin + 5, 28.6);

    // Subtle Vertical Divider before Right Metadata Column
    const dividerX = pageW - margin - 44;
    doc.setDrawColor(96, 130, 205);
    doc.setLineWidth(0.3);
    doc.line(dividerX, 14.5, dividerX, 29.8);

    // Right Block: Student Count, Issued Date, Page X of Y (100% collision-free)
    const rightX = pageW - margin - 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(167, 243, 208);
    doc.text(`${input.students.length} STUDENT${input.students.length === 1 ? '' : 'S'}`, rightX, 17, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(226, 232, 240);
    doc.text(`Issued: ${today}`, rightX, 22.8, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Page ${pageNum} of ${totalPages}`, rightX, 28.6, { align: 'right' });

    // Portal Instructions Strip with Left Navy Accent Bar
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, 35.5, contentW, 8.5, 1.5, 1.5, 'FD');
    doc.setFillColor(26, 58, 143);
    doc.rect(margin, 35.5, 1.8, 8.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(30, 41, 59);
    const guideText = includeRc
      ? `Student Portal: ${originHost}/login     |     Result Check: ${originHost}/result-check`
      : `Student Portal Login: Visit ${originHost}/login and sign in with your Username (Email) & Password below.`;
    doc.text(fitText(guideText, contentW - 8), margin + 4.5, 40.8);

    // Table Header Bar
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, 46.5, contentW, 7.5, 'F');
    doc.setDrawColor(26, 58, 143);
    doc.setLineWidth(0.45);
    doc.line(margin, 46.5, pageW - margin, 46.5);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, 54, pageW - margin, 54);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(26, 58, 143);
    doc.text('#', colNum, 51.3);
    doc.text('STUDENT & GRADE', colName, 51.3);
    doc.text('USERNAME (EMAIL)', colEmail, 51.3);
    doc.text('PASSWORD', colPass, 51.3);
    if (includeRc) doc.text('RESULT RC', colRc, 51.3);

    // Clean Footer Hairline
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 11, pageW - margin, pageH - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text('Confidential — Official Rillcod Academy Student Login Credentials', margin, pageH - 7);
    doc.text(`${originHost}  ·  Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 7, { align: 'right' });
  };

  let pageNum = 1;
  drawHeader(pageNum);
  let y = firstRowY;

  input.students.forEach((s, idx) => {
    if (y > maxRowY) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum);
      y = firstRowY;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y - 4.8, contentW, rowH, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text(String(idx + 1), colNum, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    doc.setTextColor(17, 24, 39);
    const nameLine = s.grade ? `${s.full_name} (${s.grade})` : s.full_name;
    doc.text(fitText(nameLine, colEmail - colName - 3), colName, y);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(fitText(s.email || '—', colPass - colEmail - 3), colEmail, y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(4, 120, 87);
    const passMaxW = includeRc ? colRc - colPass - 3 : pageW - margin - colPass - 2;
    doc.text(fitText(s.temp_password || '—', passMaxW), colPass, y);

    if (includeRc) {
      const rcDisplay = formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id));
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(26, 58, 143);
      doc.text(fitText(rcDisplay, pageW - margin - colRc - 1), colRc, y);
    }

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 3.5, pageW - margin, y + 3.5);
    y += rowH;
  });

  const slug = input.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'class';
  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = includeRc ? 'login-password-rc' : 'login-password';
  doc.save(`${slug}-${suffix}-${dateStr}.pdf`);
  return true;
}
