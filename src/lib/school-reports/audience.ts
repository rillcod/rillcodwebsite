import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from './types';

export type SchoolReportAudience = 'staff' | 'school';

export function resolveSchoolReportAudience(role: string): SchoolReportAudience {
  return role === 'school' ? 'school' : 'staff';
}

/** Remove learner-level evidence and internal staff diagnostics from a published snapshot. */
export function shapeSchoolReportSnapshotForSchoolAudience(snapshot: SchoolReportSnapshot): SchoolReportSnapshot {
  const finance = snapshot.finance
    ? {
        currency: snapshot.finance.currency,
        invoiceCount: snapshot.finance.invoiceCount,
        totalInvoiced: snapshot.finance.totalInvoiced,
        totalPaid: snapshot.finance.totalPaid,
        totalOutstanding: snapshot.finance.totalOutstanding,
        attached: snapshot.finance.attached,
        requestMessage: null,
        billingHref: snapshot.finance.billingHref,
        invoices: (snapshot.finance.invoices ?? []).map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          amount: invoice.amount,
          paid: invoice.paid,
          outstanding: invoice.outstanding,
          dueDate: invoice.dueDate,
        })),
        paymentAccounts: snapshot.finance.paymentAccounts,
      }
    : snapshot.finance;

  const insights = snapshot.insights
    ? {
        ...snapshot.insights,
        celebrationWall: snapshot.insights.celebrationWall.map((entry) => ({
          name: 'Learner',
          className: entry.className,
          highlight: entry.highlight.replace(/^[^:()]+(?:\([^)]+\))?:\s*/i, '').trim() || 'Strong progress this term.',
        })),
        learnerHighlights: [],
        topClass: snapshot.insights.topClass
          ? { ...snapshot.insights.topClass, teacherName: null }
          : null,
        bottomClass: snapshot.insights.bottomClass
          ? { ...snapshot.insights.bottomClass, teacherName: null }
          : null,
      }
    : snapshot.insights;

  return {
    ...snapshot,
    learners: [],
    staff: snapshot.staff
      ? {
          assignedTeachers: snapshot.staff.assignedTeachers,
          schoolAccounts: snapshot.staff.schoolAccounts,
          teachers: [],
        }
      : snapshot.staff,
    classPerformance: (snapshot.classPerformance ?? []).map((row) => ({
      ...row,
      teacherId: null,
      teacherName: null,
    })),
    finance,
    insights,
    completeness: {
      readyToPublish: true,
      score: 100,
      totalRequired: 0,
      completedRequired: 0,
      items: [],
    },
    dataSources: undefined,
    dataNotes: [],
    deliveryDeclaration: undefined,
  };
}

export function shapeSchoolReportForAudience(
  report: SchoolPerformanceReportRow,
  audience: SchoolReportAudience,
): SchoolPerformanceReportRow {
  if (audience !== 'school') return report;
  return {
    ...report,
    snapshot: shapeSchoolReportSnapshotForSchoolAudience(report.snapshot),
    lock_version: undefined as unknown as number,
    working_revision_number: null,
    created_by: undefined as unknown as string,
    creator_name: undefined,
  };
}
