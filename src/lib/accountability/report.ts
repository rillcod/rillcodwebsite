import type { Backlog, Coverage, Person, SchoolAccountabilityRow } from './types';
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
  schoolsSummary?: SchoolAccountabilityRow[];
  sessionScope?: 'current' | 'archive' | 'all';
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
 * Build a boardroom-grade Rillcod Technologies Executive Accountability PDF
 * featuring official letterhead + logo, KPI cards, embedded vector bar charts,
 * executive action recommendations, full All-Schools Scorecard, and clean tables.
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
  const scopeLabel =
    input.sessionScope === 'current'
      ? 'Current Session Only'
      : input.sessionScope === 'archive'
        ? 'Prior Session / Archive'
        : 'All Sessions';
  const termLabel = c?.term_context
    ? `${c.term_context.academic_year} · ${c.term_context.term_label}`
    : 'Active Term';
  const roles = roleCounts(input.people);
  const students = input.people.filter((p) => normalizeRole(p.role) === 'student');
  const teachers = input.people.filter((p) => normalizeRole(p.role) === 'teacher');
  const parents = input.people.filter((p) => normalizeRole(p.role) === 'parent');
  const m = computeAccountabilityMetrics(c, input.people, input.sessionScope !== 'all');
  const schoolsSummary = input.schoolsSummary ?? [];

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Helper: Draw clean horizontal vector bar chart inside a bordered card
  const drawHorizontalBarChart = (
    title: string,
    bars: Array<{ label: string; pct: number; detail: string; rgb: [number, number, number] }>,
    startY: number,
  ): number => {
    const rowH = 9;
    const boxH = 12 + bars.length * rowH + 3;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, startY, contentW, boxH, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(title, margin + 4, startY + 6.5);

    const labelW = 46;
    const detailW = 34;
    const trackX = margin + 4 + labelW;
    const trackW = contentW - 8 - labelW - detailW - 2;

    bars.forEach((b, i) => {
      const ry = startY + 13 + i * rowH;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      const shortLabel = b.label.length > 26 ? `${b.label.slice(0, 25)}…` : b.label;
      doc.text(shortLabel, margin + 4, ry);

      // Background track
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(trackX, ry - 3.2, trackW, 4, 1.2, 1.2, 'F');

      // Value bar
      const fillW = Math.max(1.5, (Math.min(100, Math.max(0, b.pct)) / 100) * trackW);
      doc.setFillColor(b.rgb[0], b.rgb[1], b.rgb[2]);
      doc.roundedRect(trackX, ry - 3.2, fillW, 4, 1.2, 1.2, 'F');

      // Right label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(17, 24, 39);
      doc.text(b.detail, pageW - margin - 4, ry, { align: 'right' });
    });

    return startY + boxH + 6;
  };

  // ── PAGE 1: OFFICIAL RILLCOD TECHNOLOGIES LETTERHEAD & EXECUTIVE BRIEF ──
  doc.setFillColor(17, 24, 39);
  doc.roundedRect(margin, 10, contentW, 28, 2.5, 2.5, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(margin, 10, contentW, 1.8, 'F');
  doc.setFillColor(220, 38, 38);
  doc.rect(margin, 36.8, contentW, 1.2, 'F');

  const textX = logoDataUrl ? margin + 20 : margin + 5;
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 4, 15.5, 13, 13, 2, 2, 'F');
    try {
      doc.addImage(logoDataUrl, 'PNG', margin + 5.2, 16.7, 10.6, 10.6);
    } catch {
      // Ignore image decode error
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(251, 146, 60);
  doc.text('RILLCOD. TECHNOLOGIES  ·  EXECUTIVE ACCOUNTABILITY REPORT', textX, 17.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('Platform Operations, Schools & Census Audit', textX, 24.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(209, 213, 219);
  doc.text(`${termLabel}  ·  ${scopeLabel}  ·  Issued ${today}${input.generatedBy ? `  ·  ${input.generatedBy}` : ''}`, textX, 31.2);

  // Executive KPI Strip (4 cards)
  let y = 43;
  const kpiW = (contentW - 9) / 4;
  const kpis: Array<{ label: string; value: string; sub: string; rgb: [number, number, number] }> = [
    {
      label: 'HEALTH SCORE',
      value: `${m.health}%`,
      sub: m.health >= 85 ? 'Healthy' : m.health >= 70 ? 'Needs Attention' : 'Action Required',
      rgb: m.health >= 85 ? [16, 185, 129] : m.health >= 70 ? [245, 158, 11] : [220, 38, 38],
    },
    {
      label: 'STUDENTS PLACED',
      value: `${m.placedPct}%`,
      sub: `${m.placed} of ${m.totalStudents} students`,
      rgb: [17, 24, 39],
    },
    {
      label: 'REPORTS SENT',
      value: `${m.publishedPct}%`,
      sub: `${m.published} published · ${m.drafts} draft`,
      rgb: [17, 24, 39],
    },
    {
      label: 'SCHOOLS TRACKED',
      value: String(schoolsSummary.length || new Set(input.people.map((p) => p.school_name).filter(Boolean)).size),
      sub: `${teachers.length} teachers · ${parents.length} parents`,
      rgb: [249, 115, 22],
    },
  ];
  kpis.forEach((k, idx) => {
    const x = margin + idx * (kpiW + 3);
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 20, 2, 2, 'FD');
    doc.setFillColor(k.rgb[0], k.rgb[1], k.rgb[2]);
    doc.rect(x, y, kpiW, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(107, 114, 128);
    doc.text(k.label, x + 3, y + 6.2);
    doc.setFontSize(13.5);
    doc.setTextColor(k.rgb[0], k.rgb[1], k.rgb[2]);
    doc.text(k.value, x + 3, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(k.sub, x + 3, y + 17.5);
  });
  y += 25;

  // Embedded Vector Chart 1: Operational Health Pillars
  const barTone = (pct: number): [number, number, number] =>
    pct >= 80 ? [16, 185, 129] : pct >= 50 ? [245, 158, 11] : [220, 38, 38];
  y = drawHorizontalBarChart(
    'EXECUTIVE VISUAL: OPERATIONAL HEALTH PILLARS',
    [
      { label: 'Class Placement', pct: m.placedPct, detail: `${m.placedPct}% (${m.placed}/${m.totalStudents})`, rgb: barTone(m.placedPct) },
      { label: 'Reports Published', pct: m.publishedPct, detail: `${m.publishedPct}% (${m.published} sent)`, rgb: barTone(m.publishedPct) },
      { label: 'Parent Email Reach', pct: m.emailPct, detail: `${m.emailPct}% (${m.parentEmail})`, rgb: barTone(m.emailPct) },
      { label: 'Parent Phone Reach', pct: m.phonePct, detail: `${m.phonePct}% (${m.parentPhone})`, rgb: barTone(m.phonePct) },
    ],
    y,
  );

  // Executive Priority Action Plan Callout Box
  const recommendations: string[] = [];
  if (m.unplaced > 0) recommendations.push(`Place ${m.unplaced} unplaced student${m.unplaced === 1 ? '' : 's'} into active classes via Quick Class Placement.`);
  if (m.drafts > 0) recommendations.push(`Follow up with teachers to publish ${m.drafts} progress report draft${m.drafts === 1 ? '' : 's'}.`);
  const schoolsMissingClasses = schoolsSummary.filter((s) => s.classes_count === 0).length;
  if (schoolsMissingClasses > 0) recommendations.push(`Complete class setup for ${schoolsMissingClasses} partner school${schoolsMissingClasses === 1 ? '' : 's'} with zero active classes.`);
  if ((m.flags.no_parent_email || 0) > 0) recommendations.push(`Link parent email contacts for ${m.flags.no_parent_email} student${m.flags.no_parent_email === 1 ? '' : 's'} to improve report delivery.`);
  if (recommendations.length === 0) recommendations.push('All core operational pillars are healthy for the active scope.');

  const recBoxH = 10 + recommendations.length * 5.2;
  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(254, 215, 170);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, recBoxH, 2, 2, 'FD');
  doc.setFillColor(249, 115, 22);
  doc.rect(margin, y, 2, recBoxH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(154, 52, 18);
  doc.text('PRIORITY EXECUTIVE RECOMMENDATIONS', margin + 5, y + 5.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(31, 41, 55);
  recommendations.forEach((rec, idx) => {
    doc.text(`•  ${rec}`, margin + 5, y + 11 + idx * 5);
  });
  y += recBoxH + 7;

  const sectionHeading = (title: string) => {
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    doc.setFillColor(249, 115, 22);
    doc.rect(margin, y - 3.8, 2, 4.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
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
    showHead: 'everyPage',
    head: [['Role', 'Count', 'Definition']],
    body: Object.entries(roles)
      .sort((a, b) => b[1] - a[1])
      .map(([role, n]) => [roleMeta(role).label, String(n), roleMeta(role).description]),
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: brandHeadStyles,
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── PAGE 2: COMPLETE ALL-SCHOOLS SCORECARD & CHART ──
  if (schoolsSummary.length > 0) {
    doc.addPage();
    y = 18;
    const topSchools = [...schoolsSummary]
      .sort((a, b) => b.students_total - a.students_total)
      .slice(0, 6);
    if (topSchools.length > 0) {
      y = drawHorizontalBarChart(
        'SCHOOL HEALTH SCORECARD (TOP SCHOOLS BY ENROLMENT)',
        topSchools.map((s) => ({
          label: s.name,
          pct: s.health_score,
          detail: `${s.health_score}% (${s.students_total} stu)`,
          rgb: barTone(s.health_score),
        })),
        y,
      );
    }

    sectionHeading(`2. Complete School-by-School Scorecard (${schoolsSummary.length} Schools)`);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      showHead: 'everyPage',
      head: [['School', 'Classes', 'Students', 'Placed', 'Reports', 'Parents', 'Health', 'Key Gaps']],
      body: [...schoolsSummary]
        .sort((a, b) => b.students_total - a.students_total || a.name.localeCompare(b.name))
        .map((s) => [
          s.name,
          String(s.classes_count),
          String(s.students_total),
          String(s.students_placed),
          String(s.reports_published),
          `${s.parent_email_pct}%`,
          `${s.health_score}%`,
          s.gaps.length ? s.gaps.join(', ') : 'All clear',
        ]),
      styles: { fontSize: 7.2, cellPadding: 1.8 },
      headStyles: brandHeadStyles,
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  }

  sectionHeading('3. Actionable Gaps & Flags');
  const flagRows = Object.entries(m.flags)
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => [FLAG_LABEL[f] ?? f, String(n)]);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    showHead: 'everyPage',
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
      showHead: 'everyPage',
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
      showHead: 'everyPage',
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
    doc.setFontSize(8.2);
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
        showHead: 'everyPage',
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

  // Teacher directory + Students with actionable gaps
  doc.addPage();
  y = 18;
  sectionHeading(`7. Teacher Directory (${teachers.length} accounts)`);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    showHead: 'everyPage',
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
  y = (doc as any).lastAutoTable.finalY + 9;

  const critical = students.filter((s) =>
    (s.flags ?? []).some((f) =>
      ['no_class', 'no_parent_email', 'no_parent_phone', 'no_report', 'class_mismatch', 'draft_pending'].includes(f),
    ),
  );
  const PDF_CAP = 120;
  sectionHeading(
    critical.length > PDF_CAP
      ? `8. Students with Actionable Gaps (showing ${PDF_CAP} of ${critical.length} — export CSV for full list)`
      : `8. Students with Actionable Gaps (${critical.length})`,
  );
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    showHead: 'everyPage',
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

  // Consistent Rillcod Technologies Footer across every page
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
