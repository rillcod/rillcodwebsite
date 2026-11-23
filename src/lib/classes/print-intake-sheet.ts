import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';

export interface PrintIntakeStudent {
  id: string;
  full_name: string;
  grade?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_verified?: boolean;
  consent_signed?: boolean;
  session_status?: 'confirmed_current' | 'carryover_unconfirmed';
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWaPhone(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '—';
  if (digits.length === 11 && digits.startsWith('0')) return `+234 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.startsWith('234') && digits.length >= 13) return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  return String(phone ?? '').trim() || '—';
}

/**
 * Generates an official Rillcod Technologies Letterhead Class Intake,
 * Parent WhatsApp Contact & Attendance Sheet (print-ready / Save as PDF).
 */
export function openClassIntakeLetterheadPdf(opts: {
  className: string;
  schoolName?: string | null;
  currentSession: string;
  classGradeKey?: string | null;
  students: PrintIntakeStudent[];
  withdrawnCount?: number;
}) {
  const {
    className,
    schoolName,
    currentSession,
    classGradeKey,
    students,
    withdrawnCount = 0,
  } = opts;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com';
  const logoUrl = `${origin}/images/logo.png`;
  const generatedAt = new Date().toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const withPhone = students.filter((s) => String(s.parent_phone ?? '').replace(/\D/g, '').length >= 10).length;
  const verifiedOrConsent = students.filter((s) => s.parent_verified || s.consent_signed).length;
  const missingPhone = Math.max(0, students.length - withPhone);

  // Group and sort progressively by Grade when a class section holds multiple grades
  const gradeCounts = new Map<string, number>();
  const sortedStudents = [...students].sort((a, b) => {
    const ga = (a.grade || classGradeKey || 'Unassigned').trim();
    const gb = (b.grade || classGradeKey || 'Unassigned').trim();
    return ga.localeCompare(gb) || a.full_name.localeCompare(b.full_name);
  });
  for (const s of sortedStudents) {
    const g = (s.grade || classGradeKey || 'Unassigned').trim();
    gradeCounts.set(g, (gradeCounts.get(g) ?? 0) + 1);
  }
  const hasMultipleGrades = gradeCounts.size > 1;
  const gradeBreakdownHtml = hasMultipleGrades
    ? `<div class="grade-strip">
        <span class="grade-strip-label">Section Grade Breakdown:</span>
        ${Array.from(gradeCounts.entries())
          .map(([g, count]) => `<span class="grade-pill">${esc(g)}: <strong>${count}</strong></span>`)
          .join('')}
      </div>`
    : '';

  let lastGroup = '';
  const rowsHtml = sortedStudents
    .map((s, idx) => {
      const g = (s.grade || classGradeKey || '—').trim();
      const groupRow =
        hasMultipleGrades && g !== lastGroup
          ? `<tr class="group-row"><td colspan="8">${esc(g)} &nbsp;·&nbsp; ${gradeCounts.get(g) ?? 0} Student${(gradeCounts.get(g) ?? 0) === 1 ? '' : 's'}</td></tr>`
          : '';
      lastGroup = g;
      const hasPhone = String(s.parent_phone ?? '').replace(/\D/g, '').length >= 10;
      const statusBadge = s.parent_verified
        ? '<span class="badge badge-green">Verified</span>'
        : s.consent_signed
        ? '<span class="badge badge-blue">Consent Signed</span>'
        : hasPhone
        ? '<span class="badge badge-amber">Pending Verify</span>'
        : '<span class="badge badge-gray">No Phone</span>';
      const rc = formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id));
      return `${groupRow}
        <tr>
          <td class="num">${idx + 1}</td>
          <td class="name">${esc(s.full_name)}</td>
          <td>${esc(g)}</td>
          <td>${esc(s.parent_name || '—')}</td>
          <td class="mono">${esc(formatWaPhone(s.parent_phone))}</td>
          <td>${statusBadge}</td>
          <td class="mono">${esc(rc)}</td>
          <td class="sig"></td>
        </tr>
      `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(className)} — Class Intake &amp; Parent Contact Roster (${esc(currentSession)})</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet { max-width: 1120px; margin: 0 auto; padding: 12px 16px; }
    .letterhead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 3px solid #111827;
      position: relative;
    }
    .letterhead::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: -6px;
      width: 140px;
      height: 3px;
      background: linear-gradient(90deg, #f97316, #dc2626);
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 48px; height: 48px; object-fit: contain; border-radius: 8px; }
    .brand-title { font-size: 18px; font-weight: 900; letter-spacing: 0.04em; color: #111827; margin: 0; }
    .brand-sub { font-size: 10px; font-weight: 700; color: #ea580c; letter-spacing: 0.12em; text-transform: uppercase; margin: 2px 0 0; }
    .brand-meta { font-size: 10px; color: #4b5563; margin: 2px 0 0; }
    .doc-meta { text-align: right; }
    .doc-title { font-size: 14px; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
    .doc-sub { font-size: 11px; font-weight: 700; color: #374151; margin: 3px 0 0; }
    .doc-date { font-size: 10px; color: #6b7280; margin: 2px 0 0; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 14px 0;
    }
    .kpi {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px 12px;
      background: #f9fafb;
    }
    .kpi-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
    .kpi-value { font-size: 18px; font-weight: 900; color: #111827; margin-top: 2px; }
    .kpi-accent { color: #047857; }
    .kpi-warn { color: #b45309; }
    .grade-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 0 0 10px;
      padding: 7px 10px;
      border-radius: 8px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
    }
    .grade-strip-label { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #9a3412; margin-right: 4px; }
    .grade-pill { font-size: 10px; font-weight: 700; color: #111827; background: #ffffff; border: 1px solid #fdba74; border-radius: 999px; padding: 2px 8px; }
    tr.group-row td {
      background: #1f2937 !important;
      color: #ffffff;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 6px 10px;
      border-color: #1f2937;
    }

    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    thead th {
      background: #111827;
      color: #ffffff;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: left;
      padding: 8px 8px;
      border: 1px solid #111827;
    }
    tbody td {
      padding: 7px 8px;
      border: 1px solid #d1d5db;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) { background: #f9fafb; }
    td.num { width: 32px; text-align: center; font-weight: 700; color: #6b7280; }
    td.name { font-weight: 800; color: #111827; }
    td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
    td.sig { width: 88px; }

    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-gray { background: #f3f4f6; color: #4b5563; }

    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #6b7280;
    }
    .no-print {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 16px;
      background: #111827;
      color: #fff;
    }
    .no-print button {
      background: #f97316;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <img src="${esc(logoUrl)}" alt="Rillcod Technologies" onerror="this.style.display='none'" />
        <div>
          <h1 class="brand-title">RILLCOD TECHNOLOGIES</h1>
          <p class="brand-sub">STEM, Coding &amp; Robotics Education</p>
          <p class="brand-meta">No 26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City · www.rillcod.com</p>
        </div>
      </div>
      <div class="doc-meta">
        <p class="doc-title">Official Class Roster &amp; Parent Contact Sheet</p>
        <p class="doc-sub">${esc(className)}${schoolName ? ` · ${esc(schoolName)}` : ''} · ${esc(currentSession)}</p>
        <p class="doc-date">Generated ${esc(generatedAt)}</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Active Students</div>
        <div class="kpi-value">${students.length}${withdrawnCount > 0 ? ` <span style="font-size:10px;color:#6b7280;font-weight:700">(${withdrawnCount} archived)</span>` : ''}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">WhatsApp Phone Ready</div>
        <div class="kpi-value kpi-accent">${withPhone} / ${students.length}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Parent Verified / Consent</div>
        <div class="kpi-value">${verifiedOrConsent}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Missing Phone</div>
        <div class="kpi-value kpi-warn">${missingPhone}</div>
      </div>
    </div>

    ${gradeBreakdownHtml}

    <table>
      <thead>
        <tr>
          <th>S/N</th>
          <th>Student Full Name</th>
          <th>Grade</th>
          <th>Parent / Guardian</th>
          <th>WhatsApp Phone</th>
          <th>Verification</th>
          <th>RC Code</th>
          <th>Attendance / Sign</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="8" style="text-align:center;padding:24px;color:#6b7280;">No active students in this class yet.</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <span>Rillcod Technologies · Official Active Class List (Excludes Withdrawn / Prior-Session Archive)</span>
      <span>Verify results at ${esc(origin)}/result-check</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* user can still click Print button */
    }
  }, 350);
  return true;
}
