import { getWAECGrade } from '@/lib/grading';
import { brandContact } from '@/config/brand';

export interface OfficePrintableKpi {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'indigo';
}

export interface OfficePrintableMeta {
  label: string;
  value: string;
}

export interface OfficePrintableConfig {
  title: string;
  subtitle: string;
  docCodePrefix?: string;
  orientation?: 'portrait' | 'landscape';
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  orgLogoUrl?: string | null;
  orgName?: string | null;
  instructionHtml?: string | null;
  metaItems?: OfficePrintableMeta[];
  kpis?: OfficePrintableKpi[];
  summaryBlockHtml?: string;
  headers: Array<{ label: string; align?: 'left' | 'center' | 'right'; width?: string }>;
  rowsHtml: string;
  emptyMessage?: string;
  signatories?: Array<{ role: string; name?: string | null }>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function openOfficialOfficePrintable(config: OfficePrintableConfig): boolean {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const issuedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const prefix = (config.docCodePrefix || 'RC-DOC').toUpperCase();
  const docRef = `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const orientation = config.orientation || 'portrait';
  const orgName = config.orgName || 'Rillcod Technologies';
  const orgLogo = config.orgLogoUrl || '/logo.png';
  const schoolName = config.schoolName || 'Partner Academic Institution';

  const toneColors: Record<NonNullable<OfficePrintableKpi['tone']>, { fg: string; bg: string; border: string }> = {
    default: { fg: '#0f172a', bg: '#f8fafc', border: '#e2e8f0' },
    emerald: { fg: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
    amber: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    rose: { fg: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
    indigo: { fg: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  };

  const metaHtml = (config.metaItems ?? [])
    .filter((m) => m.value && m.value.trim().length > 0)
    .map(
      (m) => `
      <div class="meta-cell">
        <div class="meta-label">${escapeHtml(m.label)}</div>
        <div class="meta-value">${escapeHtml(m.value)}</div>
      </div>`,
    )
    .join('');

  const kpiHtml = (config.kpis ?? [])
    .map((k) => {
      const palette = toneColors[k.tone || 'default'];
      return `
      <div class="kpi-card" style="background:${palette.bg};border-color:${palette.border};">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-value" style="color:${palette.fg};">${escapeHtml(k.value)}</div>
        ${k.sub ? `<div class="kpi-sub">${escapeHtml(k.sub)}</div>` : ''}
      </div>`;
    })
    .join('');

  const thHtml = config.headers
    .map(
      (h) =>
        `<th style="text-align:${h.align || 'left'};${h.width ? `width:${h.width};` : ''}">${escapeHtml(h.label)}</th>`,
    )
    .join('');

  const signatories = config.signatories ?? [
    { role: 'Facilitator / Instructor Signature & Date' },
    { role: 'Academic Coordinator / Quality Assurance' },
    { role: 'School Authority Stamp & Date' },
  ];

  const sigHtml = signatories
    .map(
      (s) => `
      <div class="sig-box">
        <div class="sig-name">${s.name ? escapeHtml(s.name) : '&nbsp;'}</div>
        <div class="sig-line"></div>
        <div class="sig-role">${escapeHtml(s.role)}</div>
      </div>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(config.title)} — ${escapeHtml(schoolName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 ${orientation}; margin: 12mm 12mm 14mm 12mm; }
    body {
      font-family: 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      font-size: 11px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 24px;
      background: #0f172a;
      color: #fff;
      border-bottom: 2px solid #4f46e5;
    }
    .toolbar-title { font-size: 13px; font-weight: 800; letter-spacing: 0.3px; }
    .toolbar-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
    .toolbar-actions { display: flex; align-items: center; gap: 8px; }
    .btn-print {
      padding: 8px 18px;
      border-radius: 8px;
      border: none;
      background: #4f46e5;
      color: #fff;
      font-weight: 800;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-print:hover { background: #4338ca; }
    .btn-close {
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #cbd5e1;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
    }
    .sheet {
      max-width: ${orientation === 'landscape' ? '277mm' : '210mm'};
      margin: 18px auto 32px;
      background: #fff;
      padding: 16mm 14mm;
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      border-bottom: 3px solid #0f172a;
      margin-bottom: 12px;
      gap: 16px;
    }
    .brand-left { display: flex; align-items: center; gap: 12px; }
    .brand-logo { width: 48px; height: 48px; object-fit: contain; }
    .brand-name { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; color: #0f172a; }
    .brand-tag { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #4f46e5; margin-top: 2px; }
    .brand-contact { font-size: 8.5px; color: #64748b; margin-top: 2px; }
    .brand-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
    .school-logo { height: 42px; width: auto; max-width: 120px; object-fit: contain; margin-bottom: 3px; }
    .school-name { font-size: 13px; font-weight: 900; text-transform: uppercase; color: #1e1b4b; }
    .doc-badge {
      display: inline-block;
      margin-top: 3px;
      padding: 2px 8px;
      border-radius: 4px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      font-size: 8.5px;
      font-weight: 800;
      color: #475569;
      letter-spacing: 0.6px;
    }
    .title-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #4f46e5;
      border-radius: 6px;
      padding: 9px 14px;
      margin-bottom: 10px;
    }
    .doc-title { font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0f172a; }
    .doc-subtitle { font-size: 9.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }
    .doc-meta-right { text-align: right; font-size: 9px; color: #475569; font-weight: 700; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 10px;
    }
    .meta-cell {
      padding: 6px 10px;
      border-right: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      background: #fff;
    }
    .meta-cell:last-child { border-right: none; }
    .meta-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; }
    .meta-value { font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 1px; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .kpi-card {
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .kpi-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; }
    .kpi-value { font-size: 15px; font-weight: 900; margin-top: 2px; }
    .kpi-sub { font-size: 8.5px; color: #64748b; font-weight: 600; margin-top: 1px; }
    .instruction-box {
      font-size: 9.5px;
      color: #334155;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 5px;
      padding: 6px 10px;
      margin-bottom: 10px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    thead tr { background: #0f172a; color: #ffffff; }
    thead th {
      padding: 7px 8px;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      border: 1px solid #1e293b;
    }
    tbody tr { page-break-inside: avoid; border-bottom: 1px solid #cbd5e1; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: middle; color: #1e293b; }
    .sig-grid {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1.5px solid #cbd5e1;
      display: grid;
      grid-template-columns: repeat(${signatories.length}, 1fr);
      gap: 20px;
      page-break-inside: avoid;
    }
    .sig-box { text-align: center; }
    .sig-name { font-size: 10px; font-weight: 700; color: #334155; min-height: 16px; margin-bottom: 12px; }
    .sig-line { border-bottom: 1.5px solid #0f172a; width: 85%; margin: 0 auto 4px; }
    .sig-role { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #64748b; }
    .footer-bar {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #64748b;
      font-weight: 600;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .sheet { max-width: 100%; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <div class="toolbar-title">${escapeHtml(config.title)} — Official A4 Printable PDF</div>
      <div class="toolbar-sub">Use your browser's "Save as PDF" destination or select an office printer.</div>
    </div>
    <div class="toolbar-actions">
      <button class="btn-print" onclick="window.print()">🖨 Print / Save as Official PDF</button>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  <div class="sheet">
    <div class="letterhead">
      <div class="brand-left">
        <img src="${escapeHtml(orgLogo)}" alt="Logo" class="brand-logo" onerror="this.style.display='none'" />
        <div>
          <div class="brand-name">${escapeHtml(orgName)}</div>
          <div class="brand-tag">Academy &amp; Partner School Assessment Registry</div>
          <div class="brand-contact">${escapeHtml(brandContact.addressShort)} · ${escapeHtml(brandContact.phoneShort)} · ${escapeHtml(brandContact.email)}</div>
        </div>
      </div>
      <div class="brand-right">
        ${config.schoolLogoUrl ? `<img src="${escapeHtml(config.schoolLogoUrl)}" alt="School Logo" class="school-logo" onerror="this.style.display='none'" />` : ''}
        <div class="school-name">${escapeHtml(schoolName)}</div>
        <div class="doc-badge">REF: ${escapeHtml(docRef)} · ISSUED: ${escapeHtml(issuedDate)}</div>
      </div>
    </div>

    <div class="title-banner">
      <div>
        <div class="doc-title">${escapeHtml(config.title)}</div>
        <div class="doc-subtitle">${escapeHtml(config.subtitle)}</div>
      </div>
      <div class="doc-meta-right">
        <div>OFFICIAL RECORD</div>
        <div style="color:#4f46e5;">rillcod.com/verify</div>
      </div>
    </div>

    ${metaHtml ? `<div class="meta-grid">${metaHtml}</div>` : ''}
    ${kpiHtml ? `<div class="kpi-grid">${kpiHtml}</div>` : ''}
    ${config.summaryBlockHtml || ''}
    ${config.instructionHtml ? `<div class="instruction-box">${config.instructionHtml}</div>` : ''}

    <table>
      <thead>
        <tr>${thHtml}</tr>
      </thead>
      <tbody>
        ${
          config.rowsHtml.trim().length > 0
            ? config.rowsHtml
            : `<tr><td colspan="${config.headers.length}" style="text-align:center;padding:28px;color:#64748b;font-weight:700;">${escapeHtml(config.emptyMessage || 'No records available for this selection.')}</td></tr>`
        }
      </tbody>
    </table>

    <div class="sig-grid">
      ${sigHtml}
    </div>

    <div class="footer-bar">
      <span>© ${new Date().getFullYear()} ${escapeHtml(orgName)} · Official Academic &amp; Administrative Printable</span>
      <span>Document Ref: ${escapeHtml(docRef)} · Generated ${escapeHtml(issuedDate)}</span>
    </div>
  </div>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
  };
  return true;
}

export interface BroadsheetStudentRow {
  id: string;
  full_name: string;
  class_label?: string | null;
  school_name?: string | null;
  report?: any | null;
}

/**
 * Prints the complete 6-Component WAEC Class Master Broadsheet (or 3-paper Host School Broadsheet)
 * with full class analytics, grade distribution, and signatory blocks.
 */
export function printClassMasterBroadsheet(params: {
  students: BroadsheetStudentRow[];
  term?: string | null;
  academicYear?: string | null;
  className?: string | null;
  courseName?: string | null;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  orgLogoUrl?: string | null;
  orgName?: string | null;
  instructorName?: string | null;
  scoringMode?: 'rillcod_weighted' | 'host_papers';
}): boolean {
  const isHost = params.scoringMode === 'host_papers';
  const rows = params.students;

  const scoredScores: number[] = [];
  const gradeCounts: Record<string, number> = {};
  let publishedCount = 0;
  let draftCount = 0;

  const rowsHtml = rows
    .map((s, i) => {
      const r = s.report;
      const em = r?.engagement_metrics ?? {};
      const overallNum =
        r?.overall_score != null && r.overall_score !== '' && !Number.isNaN(Number(r.overall_score))
          ? Math.round(Number(r.overall_score))
          : null;
      const waec = overallNum != null ? getWAECGrade(overallNum) : null;
      const gradeCode = r?.overall_grade || waec?.code || '—';
      if (overallNum != null) {
        scoredScores.push(overallNum);
        gradeCounts[gradeCode] = (gradeCounts[gradeCode] || 0) + 1;
      }
      if (r?.is_published) publishedCount++;
      else if (r) draftCount++;

      const statusBadge = r?.is_published
        ? `<span style="padding:2px 6px;border-radius:4px;background:#dcfce7;color:#047857;font-weight:800;font-size:8.5px;">PUBLISHED</span>`
        : r
          ? `<span style="padding:2px 6px;border-radius:4px;background:#fef3c7;color:#b45309;font-weight:800;font-size:8.5px;">DRAFT</span>`
          : `<span style="padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#64748b;font-weight:800;font-size:8.5px;">PENDING</span>`;

      if (isHost) {
        const p1 = em.host_first_test_score ?? '—';
        const p2 = em.host_second_test_score ?? '—';
        const exam = em.host_exam_score ?? r?.theory_score ?? '—';
        return `
        <tr>
          <td style="text-align:center;font-weight:800;color:#64748b;">${i + 1}</td>
          <td>
            <div style="font-weight:800;color:#0f172a;">${escapeHtml(s.full_name)}</div>
            ${s.class_label ? `<div style="font-size:9px;color:#64748b;">${escapeHtml(s.class_label)}</div>` : ''}
          </td>
          <td style="text-align:center;font-weight:700;">${escapeHtml(p1)}</td>
          <td style="text-align:center;font-weight:700;">${escapeHtml(p2)}</td>
          <td style="text-align:center;font-weight:700;">${escapeHtml(exam)}</td>
          <td style="text-align:center;font-weight:900;font-size:12px;color:#0f172a;">${overallNum != null ? `${overallNum}%` : '—'}</td>
          <td style="text-align:center;font-weight:900;color:#4f46e5;">${escapeHtml(gradeCode)}</td>
          <td style="text-align:center;">${statusBadge}</td>
        </tr>`;
      }

      const theory = r?.theory_score ?? '—';
      const classwork = em.classwork_score ?? '—';
      const practical = r?.practical_score ?? '—';
      const assignments = r?.participation_score ?? '—';
      const attendance = r?.attendance_score ?? '—';
      const assessment = em.assessment_score ?? '—';

      return `
      <tr>
        <td style="text-align:center;font-weight:800;color:#64748b;">${i + 1}</td>
        <td>
          <div style="font-weight:800;color:#0f172a;">${escapeHtml(s.full_name)}</div>
          ${s.class_label ? `<div style="font-size:9px;color:#64748b;">${escapeHtml(s.class_label)}</div>` : ''}
        </td>
        <td style="text-align:center;font-weight:700;">${escapeHtml(theory)}</td>
        <td style="text-align:center;font-weight:700;">${escapeHtml(classwork)}</td>
        <td style="text-align:center;font-weight:700;">${escapeHtml(practical)}</td>
        <td style="text-align:center;font-weight:700;">${escapeHtml(assignments)}</td>
        <td style="text-align:center;font-weight:700;">${escapeHtml(attendance)}</td>
        <td style="text-align:center;font-weight:700;">${escapeHtml(assessment)}</td>
        <td style="text-align:center;font-weight:900;font-size:12px;color:#0f172a;">${overallNum != null ? `${overallNum}%` : '—'}</td>
        <td style="text-align:center;font-weight:900;color:#4f46e5;">${escapeHtml(gradeCode)}</td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>`;
    })
    .join('');

  const avgScore =
    scoredScores.length > 0
      ? Math.round(scoredScores.reduce((a, b) => a + b, 0) / scoredScores.length)
      : null;
  const maxScore = scoredScores.length > 0 ? Math.max(...scoredScores) : null;
  const passCount = scoredScores.filter((v) => v >= 50).length;
  const passRate = scoredScores.length > 0 ? Math.round((passCount / scoredScores.length) * 100) : null;

  const gradeSummaryHtml =
    Object.keys(gradeCounts).length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;padding:6px 10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;font-size:9.5px;">
          <strong style="text-transform:uppercase;color:#475569;margin-right:4px;">WAEC Grade Breakdown:</strong>
          ${Object.entries(gradeCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(
              ([code, cnt]) =>
                `<span style="padding:2px 8px;border-radius:99px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;font-weight:800;">${escapeHtml(code)}: ${cnt}</span>`,
            )
            .join('')}
        </div>`
      : '';

  return openOfficialOfficePrintable({
    title: 'Class Master Performance Broadsheet',
    subtitle: isHost
      ? 'Official Host School Paper Score Ledger (1st Test · 2nd Test · Examination)'
      : 'Official 6-Component WAEC Continuous Assessment & Examination Ledger',
    docCodePrefix: 'RC-BROADSHEET',
    orientation: 'landscape',
    schoolName: params.schoolName,
    schoolLogoUrl: params.schoolLogoUrl,
    orgLogoUrl: params.orgLogoUrl,
    orgName: params.orgName,
    metaItems: [
      { label: 'Class / Section', value: params.className || 'All Selected Classes' },
      { label: 'Course / Subject', value: params.courseName || 'STEM & Coding Curriculum' },
      { label: 'Academic Term', value: [params.term, params.academicYear].filter(Boolean).join(' · ') || 'Current Term' },
      { label: 'Facilitator', value: params.instructorName || 'Assigned Facilitator' },
    ],
    kpis: [
      { label: 'Class Size', value: rows.length, sub: `${publishedCount} published · ${draftCount} draft` },
      {
        label: 'Class Average',
        value: avgScore != null ? `${avgScore}%` : '—',
        sub: avgScore != null ? getWAECGrade(avgScore).label : 'No scores yet',
        tone: avgScore != null && avgScore >= 65 ? 'emerald' : 'indigo',
      },
      {
        label: 'Highest Score',
        value: maxScore != null ? `${maxScore}%` : '—',
        sub: `${scoredScores.length} of ${rows.length} scored`,
        tone: 'emerald',
      },
      {
        label: 'Credit / Pass Rate',
        value: passRate != null ? `${passRate}%` : '—',
        sub: `${passCount} scored ≥ 50%`,
        tone: passRate != null && passRate >= 70 ? 'emerald' : 'amber',
      },
      {
        label: 'Pending Reports',
        value: Math.max(0, rows.length - publishedCount - draftCount),
        sub: 'Awaiting grading',
        tone: rows.length - publishedCount - draftCount > 0 ? 'rose' : 'emerald',
      },
    ],
    summaryBlockHtml: gradeSummaryHtml,
    headers: isHost
      ? [
          { label: '#', align: 'center', width: '34px' },
          { label: 'Student Name' },
          { label: '1st Test (20)', align: 'center', width: '88px' },
          { label: '2nd Test (20)', align: 'center', width: '88px' },
          { label: 'Exam (60)', align: 'center', width: '88px' },
          { label: 'Total %', align: 'center', width: '82px' },
          { label: 'WAEC Grade', align: 'center', width: '82px' },
          { label: 'Status', align: 'center', width: '92px' },
        ]
      : [
          { label: '#', align: 'center', width: '32px' },
          { label: 'Student Name' },
          { label: 'Theory (20%)', align: 'center', width: '76px' },
          { label: 'Classwork (10%)', align: 'center', width: '84px' },
          { label: 'Practical (25%)', align: 'center', width: '82px' },
          { label: 'Assign. (20%)', align: 'center', width: '78px' },
          { label: 'Attend. (10%)', align: 'center', width: '76px' },
          { label: 'Mid-Term (15%)', align: 'center', width: '82px' },
          { label: 'Overall %', align: 'center', width: '76px' },
          { label: 'WAEC', align: 'center', width: '64px' },
          { label: 'Status', align: 'center', width: '84px' },
        ],
    rowsHtml,
    signatories: [
      { role: 'Facilitator / Instructor Signature & Date', name: params.instructorName },
      { role: 'Academic Coordinator / Quality Assurance' },
      { role: 'School Principal / Head of School Stamp' },
    ],
  });
}

/**
 * Prints an Official Blank Classroom Score & Attendance Recording Sheet (A4 Landscape)
 * so teachers can record scores on paper in the classroom or exam hall and enter or upload them later.
 */
export function printBlankClassMarkSheet(params: {
  students: Array<{ id: string; full_name: string; grade?: string | null; section_class?: string | null }>;
  className?: string | null;
  courseName?: string | null;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  term?: string | null;
  academicYear?: string | null;
  instructorName?: string | null;
  scoringMode?: 'rillcod_weighted' | 'host_papers';
}): boolean {
  const isHost = params.scoringMode === 'host_papers';
  const rowsHtml = params.students
    .map(
      (s, idx) => `
      <tr>
        <td style="text-align:center;font-weight:800;color:#64748b;">${idx + 1}</td>
        <td>
          <div style="font-weight:800;color:#0f172a;">${escapeHtml(s.full_name)}</div>
        </td>
        <td style="text-align:center;font-size:9.5px;color:#475569;">${escapeHtml(s.grade || s.section_class || '—')}</td>
        ${
          isHost
            ? `
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>`
            : `
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>`
        }
      </tr>`,
    )
    .join('');

  return openOfficialOfficePrintable({
    title: 'Official Classroom Score & Attendance Recording Sheet',
    subtitle: isHost
      ? 'Offline Exam & Test Mark Sheet (1st Test · 2nd Test · Examination)'
      : 'Offline 6-Component WAEC Score Collection & Attendance Register',
    docCodePrefix: 'RC-MARKSHEET',
    orientation: 'landscape',
    schoolName: params.schoolName,
    schoolLogoUrl: params.schoolLogoUrl,
    instructionHtml:
      '<strong>CLASSROOM / EXAM HALL USE:</strong> Record raw percentage scores (0–100) or component marks clearly in ink. You can enter these marks directly into the Result Builder or upload a scanned/typed copy using <strong>Import Scores (.PDF / .TXT)</strong>.',
    metaItems: [
      { label: 'Class / Cohort', value: params.className || 'Class Roster' },
      { label: 'Course / Module', value: params.courseName || 'Assigned Course' },
      { label: 'Term & Session', value: [params.term, params.academicYear].filter(Boolean).join(' · ') || 'Current Session' },
      { label: 'Facilitator', value: params.instructorName || '—' },
      { label: 'Students Listed', value: `${params.students.length} Learners` },
    ],
    headers: isHost
      ? [
          { label: '#', align: 'center', width: '32px' },
          { label: 'Student Full Name', width: '240px' },
          { label: 'Grade', align: 'center', width: '70px' },
          { label: '1st Test (/20)', align: 'center', width: '95px' },
          { label: '2nd Test (/20)', align: 'center', width: '95px' },
          { label: 'Exam (/60)', align: 'center', width: '95px' },
          { label: 'Total (/100)', align: 'center', width: '95px' },
          { label: 'Teacher Remark / Notes' },
        ]
      : [
          { label: '#', align: 'center', width: '32px' },
          { label: 'Student Full Name', width: '210px' },
          { label: 'Grade', align: 'center', width: '64px' },
          { label: 'Theory (0-100)', align: 'center', width: '78px' },
          { label: 'Classwork (0-100)', align: 'center', width: '82px' },
          { label: 'Practical (0-100)', align: 'center', width: '82px' },
          { label: 'Assign. (0-100)', align: 'center', width: '78px' },
          { label: 'Attend. (0-100)', align: 'center', width: '78px' },
          { label: 'Mid-Term (0-100)', align: 'center', width: '82px' },
          { label: 'Total %', align: 'center', width: '68px' },
          { label: 'Key Strength / Observation' },
        ],
    rowsHtml,
    signatories: [
      { role: 'Subject Facilitator Signature & Date', name: params.instructorName },
      { role: 'Invigilator / Class Teacher Verification' },
      { role: 'Academic Coordinator Stamp & Date' },
    ],
  });
}

export interface ParsedMarkSheetEntry {
  studentId: string;
  studentName: string;
  theory_score?: number;
  classwork_score?: number;
  practical_score?: number;
  participation_score?: number;
  attendance_score?: number;
  assessment_score?: number;
  key_strengths?: string;
}

/**
 * Parses text extracted from an uploaded .PDF or .TXT score sheet and matches rows
 * against the active class roster by student name.
 * Supports lines like:
 *   "1. Adaobi Okafor | 85 | 90 | 88 | 92 | 95 | 84 | Strong logic and debugging"
 *   "Adaobi Okafor: 85, 90, 88, 92, 95, 84"
 *   "Adaobi Okafor 88" (single overall score applied across unset components)
 */
export function parseMarkSheetTextForRoster(
  rawText: string,
  roster: Array<{ id: string; full_name: string }>,
): ParsedMarkSheetEntry[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const normalizeName = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const matchedByStudent = new Map<string, ParsedMarkSheetEntry>();

  for (const student of roster) {
    const normFull = normalizeName(student.full_name || '');
    if (!normFull) continue;
    const tokens = normFull.split(' ').filter((t) => t.length >= 2);
    if (tokens.length === 0) continue;

    // Find a line that contains either the full normalized name or at least first + last name tokens
    const matchingLine = lines.find((line) => {
      const normLine = normalizeName(line);
      if (normLine.includes(normFull)) return true;
      if (tokens.length >= 2) {
        return tokens.every((tok) => normLine.includes(tok));
      }
      return false;
    });

    if (!matchingLine) continue;

    // Strip leading serial number like "1." or "01)" or "1 -"
    const withoutSerial = matchingLine.replace(/^\s*\d+[\.\)\-\s]+/, '');
    // Extract all valid 0-100 numbers in the line after the student's name
    const numbers = Array.from(withoutSerial.matchAll(/\b(100|[1-9]?\d(?:\.\d+)?)\b/g))
      .map((m) => Math.round(Number(m[1])))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 100);

    if (numbers.length === 0) continue;

    // Extract any trailing text remark (words after the last number)
    const lastNumMatch = Array.from(withoutSerial.matchAll(/\b(100|[1-9]?\d(?:\.\d+)?)\b/g)).pop();
    let remarkText = '';
    if (lastNumMatch && lastNumMatch.index != null) {
      const tail = withoutSerial
        .slice(lastNumMatch.index + lastNumMatch[0].length)
        .replace(/^[\s\|,;:\-–%]+/, '')
        .trim();
      if (tail.length >= 8 && /[a-zA-Z]{3,}/.test(tail)) {
        remarkText = tail;
      }
    }

    const entry: ParsedMarkSheetEntry = {
      studentId: student.id,
      studentName: student.full_name,
    };

    if (numbers.length >= 6) {
      entry.theory_score = numbers[0];
      entry.classwork_score = numbers[1];
      entry.practical_score = numbers[2];
      entry.participation_score = numbers[3];
      entry.attendance_score = numbers[4];
      entry.assessment_score = numbers[5];
    } else if (numbers.length === 4) {
      // Theory, Practical, Assignments, Attendance
      entry.theory_score = numbers[0];
      entry.practical_score = numbers[1];
      entry.participation_score = numbers[2];
      entry.attendance_score = numbers[3];
    } else if (numbers.length === 3) {
      // 1st Test, 2nd Test, Exam OR Theory, Practical, Assignments
      entry.classwork_score = numbers[0];
      entry.assessment_score = numbers[1];
      entry.theory_score = numbers[2];
    } else if (numbers.length >= 1) {
      const single = numbers[0];
      entry.theory_score = single;
      entry.classwork_score = single;
      entry.practical_score = single;
      entry.participation_score = single;
      entry.assessment_score = single;
    }

    if (remarkText) {
      entry.key_strengths = remarkText;
    }

    matchedByStudent.set(student.id, entry);
  }

  return Array.from(matchedByStudent.values());
}

