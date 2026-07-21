import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublishedRevision } from './revisions';
import { renderSchoolReportPdf } from './pdf';
import { resolveSchoolReportAudience, shapeSchoolReportForAudience } from './audience';
import type { SchoolPerformanceReportRow } from './types';

type AnyClient = SupabaseClient<any>;

export function safeSchoolReportPdfFilename(title: string | null | undefined): string {
  const safeName = String(title || 'school-performance-report')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90)
    .toLowerCase();
  return `${safeName || 'school-performance-report'}.pdf`;
}

export async function resolveSchoolReportRenderSource(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  revisionParam?: string | null,
): Promise<{ source: SchoolPerformanceReportRow; pdfHash: string | null }> {
  let renderSource = report;
  let pdfHash: string | null = null;

  if (revisionParam) {
    const revisionNumber = Number(revisionParam);
    const { data: revision } = await admin
      .from('school_report_revisions')
      .select('*')
      .eq('report_id', report.id)
      .eq('revision_number', revisionNumber)
      .maybeSingle();
    if (!revision || revision.status !== 'published') {
      throw new Error('Published revision not found.');
    }
    renderSource = {
      ...report,
      snapshot: revision.snapshot,
      narrative: revision.narrative,
      design: revision.design,
      status: 'published',
    };
    pdfHash = revision.pdf_hash;
  } else if (report.status === 'published') {
    const publishedRevision = await getPublishedRevision(admin, report);
    if (publishedRevision) {
      renderSource = {
        ...report,
        snapshot: publishedRevision.snapshot,
        narrative: publishedRevision.narrative,
        design: publishedRevision.design,
      };
      pdfHash = publishedRevision.pdf_hash;
    }
  }

  return { source: renderSource, pdfHash };
}

export async function buildSchoolReportPdfBuffer(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorRole: string,
  revisionParam?: string | null,
): Promise<{ buffer: Buffer; filename: string; pdfHash: string | null }> {
  const { source, pdfHash } = await resolveSchoolReportRenderSource(admin, report, revisionParam);
  const audience = resolveSchoolReportAudience(actorRole);
  const shapedSource =
    audience === 'school' ? shapeSchoolReportForAudience(source, audience) : source;
  const buffer = await renderSchoolReportPdf(shapedSource);
  return {
    buffer,
    filename: safeSchoolReportPdfFilename(report.title),
    pdfHash,
  };
}

export type SchoolReportEmailSuggestion = {
  email: string;
  name: string | null;
  label: string;
};

export async function loadSchoolReportEmailSuggestions(
  admin: AnyClient,
  schoolId: string,
): Promise<SchoolReportEmailSuggestion[]> {
  const suggestions: SchoolReportEmailSuggestion[] = [];
  const seen = new Set<string>();

  const push = (email: string | null | undefined, name: string | null | undefined, label: string) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@') || seen.has(normalized)) return;
    seen.add(normalized);
    suggestions.push({ email: normalized, name: name ? String(name).trim() : null, label });
  };

  const [{ data: billingContact }, { data: schoolUsers }] = await Promise.all([
    admin.from('billing_contacts').select('representative_email,representative_name').eq('school_id', schoolId).maybeSingle(),
    admin
      .from('portal_users')
      .select('email,full_name,role')
      .eq('school_id', schoolId)
      .in('role', ['school', 'teacher'])
      .eq('is_active', true)
      .limit(20),
  ]);

  push(billingContact?.representative_email, billingContact?.representative_name, 'Billing contact');
  for (const user of schoolUsers ?? []) {
    push(user.email, user.full_name, user.role === 'school' ? 'School account' : 'Teacher');
  }

  return suggestions;
}
