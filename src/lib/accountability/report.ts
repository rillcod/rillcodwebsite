import type { Backlog, Coverage, Person } from './types';
import { FLAG_LABEL, normalizeRole, roleMeta } from './types';

function escapeCsv(v: string | number | boolean | null | undefined) {
  let s = v == null ? '' : String(v);
  // Prevent CSV spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function downloadPeopleCsv(rows: Person[], filename = 'rillcod-accountability-census.csv') {
  const headers = [
    'Name', 'Email', 'Role', 'Role label', 'Active', 'Enrolment type',
    'School', 'Class (roster)', 'Class (profile)', 'Roster status',
    'Reports total', 'Published', 'Drafts',
    'Has Parent Phone', 'Has Parent Email', 'Flags',
  ];
  const yesNo = (v: boolean | null | undefined) => (v ? 'Yes' : 'No');
  const lines = [
    headers.join(','),
    ...rows.map((p) => [
      escapeCsv(p.full_name),
      escapeCsv(p.email),
      escapeCsv(normalizeRole(p.role)),
      escapeCsv(roleMeta(p.role).label),
      escapeCsv(p.is_active ? 'Yes' : 'No'),
      escapeCsv(p.enrollment_type),
      escapeCsv(p.school_name),
      escapeCsv(p.class_from_roster),
      escapeCsv(p.class_on_profile),
      escapeCsv(p.roster_status),
      escapeCsv(p.reports_total),
      escapeCsv(p.reports_published),
      escapeCsv(p.reports_draft),
      escapeCsv(yesNo(p.has_parent_contact)),
      escapeCsv(yesNo(p.has_parent_email)),
      escapeCsv((p.flags ?? []).map((f) => FLAG_LABEL[f] ?? f).join('; ')),
    ].join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type AccountabilityReportInput = {
  coverage: Coverage | null;
  people: Person[];
  backlog: Backlog | null;
  generatedBy?: string;
};

function roleCounts(people: Person[]) {
  const m: Record<string, number> = {};
  for (const p of people) {
    const r = normalizeRole(p.role);
    m[r] = (m[r] || 0) + 1;
  }
  return m;
}

function flagCounts(people: Person[]) {
  const m: Record<string, number> = {};
  for (const p of people) for (const f of p.flags ?? []) m[f] = (m[f] || 0) + 1;
  return m;
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

/**
 * Compute consistent, non-inflated accountability percentages shared by UI and PDF.
 * Derives directly from the scoped `people` slice so Current Session / Archive / School
 * filters never bleed stale totals from another scope.
 */
export function computeAccountabilityMetrics(coverage: Coverage | null, people: Person[], useScopedPeopleOnly = false) {
  const flags = flagCounts(people);
  const students = people.filter((p) => normalizeRole(p.role) === 'student');

  const scopedPlaced = students.filter((p) => Boolean(p.class_from_roster)).length;
  const scopedUnplaced = Math.max(0, students.length - scopedPlaced);
  const scopedPublished = students.reduce((sum, p) => sum + (Number(p.reports_published) || 0), 0);
  const scopedDrafts = students.reduce((sum, p) => sum + (Number(p.reports_draft) || 0), 0);
  const scopedReports = students.reduce((sum, p) => sum + (Number(p.reports_total) || 0), 0);
  const scopedEmail = students.filter((p) => Boolean(p.has_parent_email)).length;
  const scopedPhone = students.filter((p) => Boolean(p.has_parent_contact)).length;

  const totalStudents = useScopedPeopleOnly ? students.length : (coverage?.totals.students ?? students.length);
  const studentDenom = Math.max(totalStudents, 1);

  const placed = useScopedPeopleOnly ? scopedPlaced : (coverage?.totals.students_on_roster ?? scopedPlaced);
  const unplaced = useScopedPeopleOnly ? scopedUnplaced : (coverage?.totals.students_not_placed ?? flags.no_class ?? scopedUnplaced);
  const placedPct = totalStudents > 0 ? Math.min(100, Math.round((placed / studentDenom) * 100)) : 0;

  const reports = useScopedPeopleOnly ? scopedReports : (coverage?.totals.reports ?? scopedReports);
  const published = useScopedPeopleOnly ? scopedPublished : (coverage?.totals.published ?? scopedPublished);
  const drafts = useScopedPeopleOnly ? scopedDrafts : (coverage?.totals.draft ?? scopedDrafts);
  const reportDenom = Math.max(placed, reports, 1);
  const publishedPct = placed > 0 || reports > 0 ? Math.min(100, Math.round((published / reportDenom) * 100)) : 0;
  const draftPct = placed > 0 || reports > 0 ? Math.min(100 - publishedPct, Math.round((drafts / reportDenom) * 100)) : 0;

  const parentEmail = useScopedPeopleOnly ? scopedEmail : (coverage?.totals.parent_email_matched ?? scopedEmail);
  const parentPhone = useScopedPeopleOnly ? scopedPhone : (coverage?.totals.parent_phone_matched ?? scopedPhone);
  const emailPct = totalStudents > 0 ? Math.min(100, Math.round((parentEmail / studentDenom) * 100)) : 0;
  const phonePct = totalStudents > 0 ? Math.min(100, Math.round((parentPhone / studentDenom) * 100)) : 0;

  const health = Math.min(
    100,
    Math.max(0, Math.round(placedPct * 0.3 + publishedPct * 0.3 + emailPct * 0.2 + phonePct * 0.2)),
  );

  return {
    totalStudents,
    placed,
    unplaced,
    placedPct,
    reports,
    published,
    drafts,
    publishedPct,
    draftPct,
    parentEmail,
    parentPhone,
    emailPct,
    phonePct,
    health,
    flags,
  };
}

/**
 * Build an executive multi-section Rillcod Technologies Accountability PDF (jsPDF + autotable)
 * styled with the official Rillcod Technologies letterhead, logo mark, and obsidian/orange palette.
 */
export async function generateAccountabilityPdf(input: AccountabilityReportInput) {
  const [{ jsPDF }, autoTableMod, logoDataUrl] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadLogoDataUrl(),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  const c = input.coverage;
  const termLabel = c?.term_context
    ? `${c.term_context.academic_year} · ${c.term_context.term_label}`
    : 'Active term';
  const roles = roleCounts(input.people);
  const students = input.people.filter((p) => normalizeRole(p.role) === 'student');
  const teachers = input.people.filter((p) => normalizeRole(p.role) === 'teacher');
  const parents = input.people.filter((p) => normalizeRole(p.role) === 'parent');
  const m = computeAccountabilityMetrics(c, input.people);

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Official Rillcod Technologies Letterhead on Page 1
  doc.setFillColor(17, 24, 39);
  doc.roundedRect(margin, 10, contentW, 27, 2.5, 2.5, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(margin, 10, contentW, 1.8, 'F');
  doc.setFillColor(220, 38, 38);
  doc.rect(margin, 35.8, contentW, 1.2, 'F');

  const textX = logoDataUrl ? margin + 20 : margin + 5;
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 4, 15, 13, 13, 2, 2, 'F');
    try {
      doc.addImage(logoDataUrl, 'PNG', margin + 5.2, 16.2, 10.6, 10.6);
    } catch {
      // Ignore logo decode error
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(251, 146, 60);
  doc.text('RILLCOD. TECHNOLOGIES  ·  EXECUTIVE AUDIT', textX, 17.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('Accountability & Platform Census Report', textX, 24.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(209, 213, 219);
  doc.text(`${termLabel}  ·  Issued ${today}${input.generatedBy ? `  ·  By ${input.generatedBy}` : ''}`, textX, 30.8);

  // Executive KPI Strip (4 boxes)
  let y = 42;
  const kpiW = (contentW - 9) / 4;
  const kpis = [
    {
      label: 'HEALTH SCORE',
      value: `${m.health}%`,
      rgb: m.health >= 85 ? [16, 185, 129] : m.health >= 70 ? [245, 158, 11] : [220, 38, 38],
    },
    {
      label: 'STUDENTS PLACED',
      value: `${m.placedPct}%`,
      rgb: [17, 24, 39],
    },
    {
      label: 'REPORTS PUBLISHED',
      value: `${m.publishedPct}%`,
      rgb: [17, 24, 39],
    },
    {
      label: 'PARENT EMAILS',
      value: `${m.emailPct}%`,
      rgb: [17, 24, 39],
    },
  ];
  kpis.forEach((k, idx) => {
    const x = margin + idx * (kpiW + 3);
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 17, 2, 2, 'FD');
    doc.setFillColor(k.rgb[0], k.rgb[1], k.rgb[2]);
    doc.rect(x, y, kpiW, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(k.label, x + 3, y + 6.5);
    doc.setFontSize(13.5);
    doc.setTextColor(k.rgb[0], k.rgb[1], k.rgb[2]);
    doc.text(k.value, x + 3, y + 13.5);
  });
  y += 23;

  const sectionHeading = (title: string) => {
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    doc.setFillColor(249, 115, 22);
    doc.rect(margin, y - 3.8, 2, 4.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(title, margin + 4.5, y);
    y += 3;
  };

  const brandHeadStyles = { fillColor: [17, 24, 39] as [number, number, number], textColor: 255 };
  const accentHeadStyles = { fillColor: [194, 65, 12] as [number, number, number], textColor: 255 };

  sectionHeading('1. Platform Accounts by Role');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Role', 'Count', 'Definition']],
    body: Object.entries(roles)
      .sort((a, b) => b[1] - a[1])
      .map(([role, n]) => [roleMeta(role).label, String(n), roleMeta(role).description]),
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: brandHeadStyles,
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });
  y = (doc as any).lastAutoTable.finalY + 9;

  sectionHeading('2. Headline Term Metrics');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Value']],
    body: [
      ['Total platform accounts', String(input.people.length)],
      ['Students / Teachers / Parents', `${students.length} / ${teachers.length} / ${parents.length}`],
      ['Students placed on active class roster', `${m.placed} of ${m.totalStudents} (${m.placedPct}%)`],
      ['Students not yet placed in a class', String(m.unplaced)],
      ['Progress reports published (vs placed)', `${m.published} (${m.publishedPct}%)`],
      ['Unpublished report drafts', String(m.drafts)],
      ['Parent email linked', `${m.parentEmail} (${m.emailPct}%)`],
      ['Parent phone linked', `${m.parentPhone} (${m.phonePct}%)`],
      ['Withdrawn / ended students', String(c?.totals.withdrawn_students ?? m.flags.withdrawn ?? 0)],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: brandHeadStyles,
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });
  y = (doc as any).lastAutoTable.finalY + 9;

  sectionHeading('3. Actionable Gaps & Flags');
  const flagRows = Object.entries(m.flags)
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => [FLAG_LABEL[f] ?? f, String(n)]);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Issue / Gap', 'Accounts Affected']],
    body: flagRows.length ? flagRows : [['No active gaps detected', '0']],
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: accentHeadStyles,
    alternateRowStyles: { fillColor: [255, 247, 237] },
  });
  y = (doc as any).lastAutoTable.finalY + 9;

  if (c?.by_teacher && c.by_teacher.length > 0) {
    sectionHeading('4. Teacher Report Performance');
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Teacher', 'Course', 'Total', 'Published', 'Drafts', 'Completion']],
      body: c.by_teacher.map((t) => [
        t.teacher,
        t.course,
        String(t.total_reports),
        String(t.published),
        String(t.drafts),
        `${t.completion_pct}%`,
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: brandHeadStyles,
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  }

  if (c?.by_class && c.by_class.length > 0) {
    sectionHeading('5. Class Coverage');
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Class', 'Students', 'Reports', 'Published', 'Drafts', 'Missing']],
      body: c.by_class.map((row) => {
        const missing = row.missing ?? Math.max(0, row.students - (row.published + row.draft));
        return [
          row.class,
          String(row.students),
          String(row.reports),
          String(row.published),
          String(row.draft),
          String(missing),
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: brandHeadStyles,
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  }

  if (input.backlog && input.backlog.hidden_by_term_filter.drafts > 0) {
    sectionHeading('6. Cross-Term Unpublished Backlog');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    const lines = doc.splitTextToSize(
      `Across all terms there are ${input.backlog.all_terms.drafts} unpublished drafts; ${input.backlog.hidden_by_term_filter.drafts} sit outside the active term filter.`,
      contentW,
    );
    doc.text(lines, margin, y + 2);
    y += lines.length * 4 + 4;

    if (input.backlog.overdue_by_teacher.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Teacher', 'Course', 'Term', 'Drafts', 'Oldest (days)']],
        body: input.backlog.overdue_by_teacher.slice(0, 40).map((o) => [
          o.teacher,
          o.course || '—',
          o.term,
          String(o.drafts),
          o.oldest_days == null ? '—' : String(o.oldest_days),
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        headStyles: accentHeadStyles,
      });
      y = (doc as any).lastAutoTable.finalY + 9;
    }
  }

  // Teacher directory
  doc.addPage();
  y = 18;
  sectionHeading(`7. Teacher Directory (${teachers.length} accounts)`);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Name', 'Email', 'School', 'Active', 'Published', 'Drafts']],
    body: teachers.length
      ? teachers
          .slice()
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
          .map((t) => [
            t.full_name || '(no name)',
            t.email || '—',
            t.school_name || '—',
            t.is_active ? 'Yes' : 'No',
            String(t.reports_published),
            String(t.reports_draft),
          ])
      : [['No teacher accounts found', '', '', '', '', '']],
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: brandHeadStyles,
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  // Students with critical gaps (explicitly note total count if capped for PDF size)
  const critical = students.filter((s) =>
    (s.flags ?? []).some((f) =>
      ['no_class', 'no_parent_email', 'no_parent_phone', 'no_report', 'class_mismatch', 'draft_pending'].includes(f),
    ),
  );
  const PDF_CAP = 120;
  doc.addPage();
  y = 18;
  sectionHeading(
    critical.length > PDF_CAP
      ? `8. Students with Actionable Gaps (showing ${PDF_CAP} of ${critical.length} — export CSV for full list)`
      : `8. Students with Actionable Gaps (${critical.length})`,
  );
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Student', 'School', 'Roster Class', 'Gaps']],
    body: critical.length
      ? critical.slice(0, PDF_CAP).map((s) => [
          s.full_name || '(no name)',
          s.school_name || '—',
          s.class_from_roster || 'Not placed',
          (s.flags ?? []).map((f) => FLAG_LABEL[f] ?? f).join('; '),
        ])
      : [['No critical student gaps', '', '', '']],
    styles: { fontSize: 7, cellPadding: 1.6 },
    headStyles: accentHeadStyles,
    alternateRowStyles: { fillColor: [255, 247, 237] },
  });

  // Consistent Rillcod Technologies Footer across all pages
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 11, pageW - margin, pageH - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text('Rillcod Technologies  ·  Official Accountability & Census Report', margin, pageH - 7);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 7, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`rillcod-accountability-report-${stamp}.pdf`);
}
