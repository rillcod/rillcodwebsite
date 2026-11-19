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

/**
 * Opens a clean A4 printable/PDF sheet showing EVERY student's Username (Email),
 * Password, and Result Check RC Number — works anytime (no published result required).
 */
export function openClassCredentialsPrintSheet(input: {
  className: string;
  schoolName?: string | null;
  students: CredentialSheetStudent[];
}): boolean {
  if (!input.students.length) return false;
  const win = window.open('', '_blank');
  if (!win) return false;

  const originHost = window.location.origin.replace(/^https?:\/\//, '');
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

  const html = `<!doctype html>
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
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;

  openPrintWindow(html, win);
  return true;
}
