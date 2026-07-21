export const REPORT_TODAY = new Date().toISOString().slice(0, 10);
export const REPORT_PRIOR = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

export const pct = (value: number) => `${Number(value || 0).toFixed(value % 1 ? 1 : 0)}%`;

export const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const plainStatus = (value: string) =>
  String(value || 'pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const defaultSetupForm = () => ({
  schoolId: '',
  academicTermId: '',
  title: 'School Performance and Curriculum Report',
  startDate: REPORT_PRIOR,
  endDate: REPORT_TODAY,
  curriculumStartTerm: 1,
  curriculumStartWeek: 1,
  curriculumEndTerm: 1,
  curriculumEndWeek: 12,
});
