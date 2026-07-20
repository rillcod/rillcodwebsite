import { DEFAULT_SCHOOL_REPORT_DESIGN, normalizeSchoolReportDesign, type SchoolReportDesignSettings } from './design';

export function designFromReport(
  design: Partial<SchoolReportDesignSettings> | null | undefined,
): SchoolReportDesignSettings {
  return normalizeSchoolReportDesign(design);
}

export function designFromRow(row: { design?: Partial<SchoolReportDesignSettings> | null } | null | undefined) {
  return normalizeSchoolReportDesign(row?.design ?? DEFAULT_SCHOOL_REPORT_DESIGN);
}
