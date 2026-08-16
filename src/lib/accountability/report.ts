import type { Backlog, Coverage, Person } from './types';
import { FLAG_LABEL, normalizeRole, roleMeta } from './types';

function escapeCsv(v: string | number | boolean | null | undefined) {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function downloadPeopleCsv(rows: Person[], filename = 'accountability-census.csv') {
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

/**
 * Build a concrete multi-section PDF accountability report (jsPDF + autotable).
 */
export async function generateAccountabilityPdf(input: AccountabilityReportInput) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  const c = input.coverage;
  const termLabel = c?.term_context
    ? `${c.term_context.academic_year} · ${c.term_context.term_label}`
    : 'Active term';
  const roles = roleCounts(input.people);
  const flags = flagCounts(input.people);
  const students = input.people.filter((p) => normalizeRole(p.role) === 'student');
  const teachers = input.people.filter((p) => normalizeRole(p.role) === 'teacher');
  const parents = input.people.filter((p) => normalizeRole(p.role) === 'parent');

  const totalStudents = c?.totals.students || students.length || 1;
  const placed = c?.totals.students_on_roster || 0;
  const published = c?.totals.published || 0;
  const drafts = c?.totals.draft || 0;
  const reports = c?.totals.reports || 0;
  const parentEmail = c?.totals.parent_email_matched ?? Math.max(0, students.length - (flags.no_parent_email || 0));
  const parentPhone = c?.totals.parent_phone_matched ?? Math.max(0, students.length - (flags.no_parent_phone || 0));
  const placedPct = Math.round((placed / totalStudents) * 100);
  const publishedPct = reports > 0 ? Math.round((published / reports) * 100) : 0;
  const emailPct = Math.round((parentEmail / totalStudents) * 100);
  const phonePct = Math.round((parentPhone / totalStudents) * 100);
  const health = Math.min(100, Math.max(0, Math.round(
    placedPct * 0.3 + publishedPct * 0.3 + emailPct * 0.2 + phonePct * 0.2,
  )));

  const addFooter = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Rillcod Technologies · Accountability Census Report · Page ${i} of ${pages}`,
        margin,
        doc.internal.pageSize.getHeight() - 8,
      );
    }
  };

  // Cover
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text('Accountability Census Report', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text('Concrete platform census — roles, coverage, teachers, and gaps', margin, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(`Term scope: ${termLabel}`, margin, y);
  y += 5;
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, margin, y);
  y += 5;
  if (input.generatedBy) {
    doc.text(`Prepared by: ${input.generatedBy}`, margin, y);
    y += 5;
  }
  if (c?.generated_at) {
    doc.text(`Data snapshot: ${new Date(c.generated_at).toLocaleString('en-GB')}`, margin, y);
    y += 8;
  } else {
    y += 3;
  }

  doc.setFillColor(health >= 85 ? 16 : health >= 70 ? 245 : 244, health >= 85 ? 185 : health >= 70 ? 158 : 63, health >= 85 ? 129 : health >= 70 ? 11 : 94);
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 2, 2, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Operational health score: ${health}%`, margin + 4, y + 11);
  y += 26;

  doc.setTextColor(20);
  doc.setFontSize(12);
  doc.text('1. Who is on the platform', margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Role', 'Count', 'What this role means']],
    body: Object.entries(roles)
      .sort((a, b) => b[1] - a[1])
      .map(([role, n]) => [roleMeta(role).label, String(n), roleMeta(role).description]),
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [26, 58, 143], textColor: 255 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text('2. Headline metrics (active term)', margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Value']],
    body: [
      ['All accounts', String(input.people.length)],
      ['Students', String(students.length)],
      ['Teachers', String(teachers.length)],
      ['Parents', String(parents.length)],
      ['Students on roster', `${placed} (${placedPct}%)`],
      ['Reports written', String(reports)],
      ['Reports published', `${published} (${publishedPct}%)`],
      ['Unpublished drafts', String(drafts)],
      ['Parent email linked', `${parentEmail} (${emailPct}%)`],
      ['Parent phone linked', `${parentPhone} (${phonePct}%)`],
      ['Withdrawn / ended students', String(c?.totals.withdrawn_students ?? flags.withdrawn ?? 0)],
    ],
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [26, 58, 143], textColor: 255 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 240) {
    doc.addPage();
    y = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('3. Gaps & flags (active term)', margin, y);
  y += 2;

  const flagRows = Object.entries(flags)
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => [FLAG_LABEL[f] ?? f, String(n)]);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Gap / Flag', 'Accounts affected']],
    body: flagRows.length ? flagRows : [['No flags', '0']],
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [180, 83, 9], textColor: 255 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Teachers
  if (c?.by_teacher && c.by_teacher.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('4. Teacher report performance (active term)', margin, y);
    y += 2;
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
      headStyles: { fillColor: [109, 40, 217], textColor: 255 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Classes
  if (c?.by_class && c.by_class.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('5. Class coverage (active term)', margin, y);
    y += 2;
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
      headStyles: { fillColor: [26, 58, 143], textColor: 255 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Backlog
  if (input.backlog && input.backlog.hidden_by_term_filter.drafts > 0) {
    if (y > 230) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('6. Cross-term unpublished backlog', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(
      `Active-term view hides older drafts. Across all terms there are ${input.backlog.all_terms.drafts} unpublished reports; ${input.backlog.hidden_by_term_filter.drafts} of those sit outside the active term.`,
      pageW - margin * 2,
    );
    doc.text(lines, margin, y);
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
        headStyles: { fillColor: [190, 18, 60], textColor: 255 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // Teacher directory (every teacher listed as teacher)
  doc.addPage();
  y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text('7. Teacher directory (every teacher account)', margin, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Name', 'Email', 'School', 'Active', 'Reports published', 'Drafts']],
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
    headStyles: { fillColor: [109, 40, 217], textColor: 255 },
  });

  // Students with critical gaps
  doc.addPage();
  y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text('8. Students with critical gaps', margin, y);
  y += 2;
  const critical = students.filter((s) =>
    (s.flags ?? []).some((f) =>
      ['no_class', 'no_parent_email', 'no_parent_phone', 'no_report', 'class_mismatch', 'draft_pending'].includes(f),
    ),
  );
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Student', 'School', 'Roster class', 'Gaps']],
    body: critical.length
      ? critical.slice(0, 80).map((s) => [
          s.full_name || '(no name)',
          s.school_name || '—',
          s.class_from_roster || 'not placed',
          (s.flags ?? []).map((f) => FLAG_LABEL[f] ?? f).join('; '),
        ])
      : [['No critical student gaps', '', '', '']],
    styles: { fontSize: 7, cellPadding: 1.6 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255 },
  });

  addFooter();
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`accountability-report-${stamp}.pdf`);
}
