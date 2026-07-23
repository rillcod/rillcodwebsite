import {
  buildRosterPdfGroups,
  downloadStudentRosterPdf,
  type StudentRosterRow,
} from '@/lib/cards/exportRoster';
import { fetchCardConfig } from '@/lib/cards/printCard';

export type SchoolReportRosterResponse = {
  rows: StudentRosterRow[];
  count: number;
  schoolId: string;
  schoolName: string;
  reportTitle?: string;
  loadedStudents?: number;
  skipped?: number;
};

/** Fetch live roster rows for a school report and open/save the RC roster PDF. */
export async function downloadSchoolReportRosterPdf(
  reportId: string,
  opts?: {
    mode?: 'print' | 'save';
    title?: string;
    splitByClass?: boolean;
  },
): Promise<{ ok: boolean; count: number; message?: string }> {
  const res = await fetch(`/api/school-performance-reports/${reportId}/roster`);
  const payload = await res.json().catch(() => ({})) as SchoolReportRosterResponse & { error?: string };
  if (!res.ok) {
    return { ok: false, count: 0, message: payload.error || 'Could not load roster data.' };
  }

  const rows = payload.rows ?? [];
  if (!rows.length) {
    return {
      ok: false,
      count: 0,
      message: payload.loadedStudents
        ? 'No printable RC numbers for active learners at this school.'
        : 'No active learners found for this school.',
    };
  }

  const cardConfig = await fetchCardConfig('student');
  const splitByClass = opts?.splitByClass ?? true;
  const groups = buildRosterPdfGroups(rows, 'class');
  const title = opts?.title ?? `RC Roster — ${payload.schoolName}`;

  const ok = await downloadStudentRosterPdf(rows, {
    title,
    orgName: cardConfig.orgName,
    orgWebsite: cardConfig.orgWebsite,
    accentColor: cardConfig.accentColor,
    origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    pdfGroups: splitByClass && groups.length > 0 ? groups : undefined,
    groupMode: splitByClass ? 'class' : undefined,
    mode: opts?.mode ?? 'print',
    filename: `${payload.schoolName.replace(/\s+/g, '-').toLowerCase()}-rc-roster.pdf`,
  });

  if (!ok) {
    return { ok: false, count: rows.length, message: 'Pop-up blocked — allow pop-ups to print the roster PDF.' };
  }

  const skippedNote = payload.skipped ? ` · ${payload.skipped} skipped (no RC code)` : '';
  return {
    ok: true,
    count: rows.length,
    message: splitByClass && groups.length > 1
      ? `Roster ready — ${groups.length} classes · ${rows.length} students${skippedNote}`
      : `Roster ready — ${rows.length} student${rows.length === 1 ? '' : 's'}${skippedNote}`,
  };
}
