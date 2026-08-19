/** Canonical UUID check shared by school-report API routes. */
export const SCHOOL_REPORT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSchoolReportUuid(value: string | null | undefined): value is string {
  return Boolean(value && SCHOOL_REPORT_UUID.test(value));
}
