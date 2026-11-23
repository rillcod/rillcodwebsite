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

async function loadLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/images/logo.png', { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function buildCredentialsHtml(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
  includeRc?: boolean;
  autoPrint?: boolean;
}): string {
  const includeRc = input.includeRc === true;
  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com';
  const originHost = originUrl.replace(/^https?:\/\//, '');
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
    ? 'Student Portal Login & RC Login List'
    : 'Student Portal Login List (Username & Password)';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(heading)} — ${esc(input.className)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Inter, system-ui, sans-serif; color: #111827; margin: 0; font-size: 11px; }
    .hdr {
      position: relative;
      background: #111827;
      background-image: radial-gradient(rgba(249,115,22,0.14) 1px, transparent 1px);
      background-size: 12px 12px;
      color: #ffffff;
      border-top: 4px solid #f97316;
      border-bottom: 2px solid #dc2626;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .hdr-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .hdr-logo {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #ffffff;
      padding: 5px;
      object-fit: contain;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .hdr-brand { font-size: 11px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: #ffffff; }
    .hdr-brand span { color: #f97316; }
    .hdr-tag { font-size: 8px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #fdba74; margin-top: 2px; }
    .hdr h1 { margin: 4px 0 0; font-size: 15px; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; line-height: 1.25; }
    .hdr-sub { margin: 3px 0 0; color: #d1d5db; font-size: 10.5px; font-weight: 600; }
    .hdr-meta { text-align: right; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.18); padding-left: 14px; }
    .hdr-count { font-size: 12px; font-weight: 900; color: #fb923c; text-transform: uppercase; letter-spacing: 0.05em; }
    .hdr-date { margin-top: 3px; font-size: 9.5px; color: #e5e7eb; }
    .guide {
      display: grid;
      grid-template-columns: ${includeRc ? '1fr 1fr' : '1fr'};
      gap: 8px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-left: 3.5px solid #f97316;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 10px;
      font-size: 10px;
      color: #1f2937;
    }
    .guide strong { color: #c2410c; }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #f9fafb;
      color: #111827;
      border-top: 2px solid #f97316;
      border-bottom: 1.5px solid #e5e7eb;
      text-align: left;
      padding: 7px 8px;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td { border-bottom: 1px solid #e5e7eb; padding: 6.5px 8px; vertical-align: middle; }
    tr:nth-child(even) td { background: #f9fafb; }
    .num { width: 26px; text-align: center; color: #6b7280; font-weight: 700; }
    .name { font-weight: 700; color: #111827; font-size: 11.5px; }
    .meta { font-size: 9.5px; color: #6b7280; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
    .pw { font-weight: 700; color: #047857; }
    .rc { font-weight: 800; color: #c2410c; }
    .foot { margin-top: 12px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #6b7280; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <img class="hdr-logo" src="${esc(originUrl)}/images/logo.png" alt="Rillcod Technologies" />
      <div>
        <div class="hdr-brand">RILLCOD<span>.</span> TECHNOLOGIES</div>
        <div class="hdr-tag">Official Student Portal &amp; RC Login Credentials</div>
        <h1>${esc(heading)}</h1>
        <div class="hdr-sub">${esc(input.className)}${input.schoolName ? ` &nbsp;·&nbsp; ${esc(input.schoolName)}` : ''}</div>
      </div>
    </div>
    <div class="hdr-meta">
      <div class="hdr-count">${input.students.length} Student${input.students.length === 1 ? '' : 's'}</div>
      <div class="hdr-date">Issued: ${esc(today)}</div>
    </div>
  </div>
  <div class="guide">
    <div><strong>Student Portal Login:</strong> Visit <strong>${esc(originHost)}/login</strong> and sign in with Username (Email) &amp; Password below.</div>
    ${includeRc ? `<div><strong>RC Login / Result Check:</strong> Visit <strong>${esc(originHost)}/result-check</strong> and enter the RC Code below.</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Student &amp; Grade</th>
        <th>Username (Email)</th>
        <th>Password</th>
        ${includeRc ? '<th>RC Login Code</th>' : ''}
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot">
    <span>Confidential — Official Rillcod Technologies Student Credentials</span>
    <span>${esc(originHost)}</span>
  </div>
  ${input.autoPrint !== false ? '<script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>' : ''}
</body>
</html>`;
}

/**
 * Opens a clean A4 printable sheet showing EVERY student's Username (Email) & Password
 * (with optional RC Login / Result Check Code when `includeRc: true`).
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
 * Direct 1-click A4 PDF download (jsPDF) styled with the official Rillcod Technologies
 * letterhead, logo mark, brand orange/red accents, and RC Login details.
 */
export async function downloadClassCredentialsPdf(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
  includeRc?: boolean;
}): Promise<boolean> {
  if (!input.students.length || typeof window === 'undefined') return false;
  const includeRc = input.includeRc === true;
  const [{ default: JsPDF }, logoDataUrl] = await Promise.all([
    import('jspdf'),
    loadLogoDataUrl(),
  ]);
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
    ? 'Student Portal Login & RC Login List'
    : 'Student Portal Login List';

  const rowH = 8.5;
  const firstRowY = 60;
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
    // Official Rillcod Technologies Obsidian Header Card + Brand Orange/Red Stripes
    doc.setFillColor(17, 24, 39);
    doc.roundedRect(margin, 10, contentW, 25, 2.5, 2.5, 'F');
    doc.setFillColor(249, 115, 22);
    doc.rect(margin, 10, contentW, 1.8, 'F');
    doc.setFillColor(220, 38, 38);
    doc.rect(margin, 33.8, contentW, 1.2, 'F');

    // White Logo Badge + Official Rillcod Logo
    const textStartX = logoDataUrl ? margin + 20 : margin + 5;
    if (logoDataUrl) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 4, 14.5, 13, 13, 2, 2, 'F');
      try {
        doc.addImage(logoDataUrl, 'PNG', margin + 5.2, 15.7, 10.6, 10.6);
      } catch {
        // Ignore image decoding errors in restricted environments
      }
    }

    // Left Block: RILLCOD. TECHNOLOGIES + Document Title + Class & School Metadata
    const leftMaxW = contentW - (textStartX - margin) - 46;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(251, 146, 60);
    doc.text('RILLCOD. TECHNOLOGIES  ·  OFFICIAL CREDENTIALS', textStartX, 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(fitText(heading, leftMaxW), textStartX, 23.4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(209, 213, 219);
    const sub = `${input.className}${input.schoolName ? `  ·  ${input.schoolName}` : ''}`;
    doc.text(fitText(sub, leftMaxW), textStartX, 29.4);

    // Subtle Vertical Divider before Right Metadata Column
    const dividerX = pageW - margin - 43;
    doc.setDrawColor(75, 85, 99);
    doc.setLineWidth(0.3);
    doc.line(dividerX, 14.5, dividerX, 30.8);

    // Right Block: Student Count, Issued Date, Page X of Y
    const rightX = pageW - margin - 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(251, 146, 60);
    doc.text(`${input.students.length} STUDENT${input.students.length === 1 ? '' : 'S'}`, rightX, 17.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(229, 231, 235);
    doc.text(`Issued: ${today}`, rightX, 23.4, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Page ${pageNum} of ${totalPages}`, rightX, 29.4, { align: 'right' });

    // Portal & RC Login Instructions Strip with Brand Orange Accent
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(254, 215, 170);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, 37, contentW, 8.5, 1.5, 1.5, 'FD');
    doc.setFillColor(249, 115, 22);
    doc.rect(margin, 37, 1.8, 8.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(31, 41, 55);
    const guideText = includeRc
      ? `Portal Login: ${originHost}/login     |     RC Login / Result Check: ${originHost}/result-check`
      : `Student Portal Login: Visit ${originHost}/login and sign in with your Username (Email) & Password below.`;
    doc.text(fitText(guideText, contentW - 8), margin + 4.5, 42.3);

    // Table Header Bar
    doc.setFillColor(249, 250, 251);
    doc.rect(margin, 48, contentW, 7.5, 'F');
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.5);
    doc.line(margin, 48, pageW - margin, 48);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, 55.5, pageW - margin, 55.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(17, 24, 39);
    doc.text('#', colNum, 52.8);
    doc.text('STUDENT & GRADE', colName, 52.8);
    doc.text('USERNAME (EMAIL)', colEmail, 52.8);
    doc.text('PASSWORD', colPass, 52.8);
    if (includeRc) doc.text('RC LOGIN CODE', colRc, 52.8);

    // Clean Footer Hairline
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 11, pageW - margin, pageH - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(107, 114, 128);
    doc.text('Confidential — Official Rillcod Technologies Student Credentials', margin, pageH - 7);
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
    doc.setTextColor(107, 114, 128);
    doc.text(String(idx + 1), colNum, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    doc.setTextColor(17, 24, 39);
    const nameLine = s.grade ? `${s.full_name} (${s.grade})` : s.full_name;
    doc.text(fitText(nameLine, colEmail - colName - 3), colName, y);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);
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
      doc.setTextColor(194, 65, 12);
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
