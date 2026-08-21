import { REPORT_WINDOW_WEEK_OPTIONS } from '../delivery-declaration';

export const REPORT_TODAY = new Date().toISOString().slice(0, 10);

export const pct = (value: number) => `${Number(value || 0).toFixed(value % 1 ? 1 : 0)}%`;

/** 0% with no evidence looks like mass absence — show an em dash until coverage exists. */
export const attendancePct = (rate: number | null | undefined, learnersWithEvidence?: number | null) =>
  Number(learnersWithEvidence || 0) > 0 ? pct(Number(rate || 0)) : '—';

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
  title: '',
  startDate: REPORT_TODAY,
  endDate: REPORT_TODAY,
  curriculumStartTerm: 1,
  curriculumStartWeek: 1,
  curriculumEndTerm: 1,
  curriculumEndWeek: REPORT_WINDOW_WEEK_OPTIONS[REPORT_WINDOW_WEEK_OPTIONS.length - 1],
  curriculumOverrideReason: '',
  selectedTopicKeys: [],
  excludeBilling: false,
  excludeBillingReason: '',
});
