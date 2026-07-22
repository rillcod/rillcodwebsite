import type { SupabaseClient } from '@supabase/supabase-js';
import { brandContact } from '@/config/brand';

type AnyClient = SupabaseClient<any>;

export type SchoolReportPolicy = {
  grading: { excellentMin: number; developingMin: number };
  attendance: { strongMin: number; riskBelow: number };
  phases: Record<string, string>;
  programmePhases: Record<string, Record<string, string>>;
  signatory: { name: string; title: string; signatureAsset: string; activeFrom: string | null; activeUntil: string | null };
  payment: { whatsappDisplay: string; whatsappUrl: string };
  finance: { defaultCurrency: string; locale: string; enrolmentToleranceCount: number; enrolmentTolerancePercent: number };
  display: { maxChartRows: number; maxHighlights: number; maxRecommendations: number };
};

export const SCHOOL_REPORT_POLICY_KEY = 'school_report_policy';
export const DEFAULT_SCHOOL_REPORT_POLICY: SchoolReportPolicy = {
  grading: { excellentMin: 75, developingMin: 50 },
  attendance: { strongMin: 80, riskBelow: 60 },
  phases: { '1': 'Foundations', '2': 'Application', '3': 'Innovation' },
  programmePhases: {},
  signatory: { name: 'Mr Osahon', title: 'Director, Rillcod Technologies', signatureAsset: '/images/signature.png', activeFrom: null, activeUntil: null },
  payment: { whatsappDisplay: brandContact.phoneShort, whatsappUrl: brandContact.whatsapp },
  finance: { defaultCurrency: 'NGN', locale: 'en-NG', enrolmentToleranceCount: 2, enrolmentTolerancePercent: 10 },
  display: { maxChartRows: 12, maxHighlights: 4, maxRecommendations: 4 },
};

const finite = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeSchoolReportPolicy(input: unknown): SchoolReportPolicy {
  const value = input && typeof input === 'object' ? input as Partial<SchoolReportPolicy> : {};
  return {
    grading: {
      excellentMin: finite(value.grading?.excellentMin, DEFAULT_SCHOOL_REPORT_POLICY.grading.excellentMin),
      developingMin: finite(value.grading?.developingMin, DEFAULT_SCHOOL_REPORT_POLICY.grading.developingMin),
    },
    attendance: {
      strongMin: finite(value.attendance?.strongMin, DEFAULT_SCHOOL_REPORT_POLICY.attendance.strongMin),
      riskBelow: finite(value.attendance?.riskBelow, DEFAULT_SCHOOL_REPORT_POLICY.attendance.riskBelow),
    },
    phases: { ...DEFAULT_SCHOOL_REPORT_POLICY.phases, ...(value.phases || {}) },
    programmePhases: value.programmePhases && typeof value.programmePhases === 'object' ? value.programmePhases : {},
    signatory: { ...DEFAULT_SCHOOL_REPORT_POLICY.signatory, ...(value.signatory || {}) },
    payment: { ...DEFAULT_SCHOOL_REPORT_POLICY.payment, ...(value.payment || {}) },
    finance: {
      ...DEFAULT_SCHOOL_REPORT_POLICY.finance,
      ...(value.finance || {}),
      enrolmentToleranceCount: finite(value.finance?.enrolmentToleranceCount, DEFAULT_SCHOOL_REPORT_POLICY.finance.enrolmentToleranceCount),
      enrolmentTolerancePercent: finite(value.finance?.enrolmentTolerancePercent, DEFAULT_SCHOOL_REPORT_POLICY.finance.enrolmentTolerancePercent),
    },
    display: {
      maxChartRows: Math.max(1, finite(value.display?.maxChartRows, DEFAULT_SCHOOL_REPORT_POLICY.display.maxChartRows)),
      maxHighlights: Math.max(1, finite(value.display?.maxHighlights, DEFAULT_SCHOOL_REPORT_POLICY.display.maxHighlights)),
      maxRecommendations: Math.max(1, finite(value.display?.maxRecommendations, DEFAULT_SCHOOL_REPORT_POLICY.display.maxRecommendations)),
    },
  };
}

export async function loadSchoolReportPolicy(admin: AnyClient): Promise<SchoolReportPolicy> {
  const { data, error } = await admin.from('system_settings').select('setting_value').eq('setting_key', SCHOOL_REPORT_POLICY_KEY).maybeSingle();
  if (error || !data?.setting_value) return DEFAULT_SCHOOL_REPORT_POLICY;
  try { return normalizeSchoolReportPolicy(JSON.parse(data.setting_value)); }
  catch { return DEFAULT_SCHOOL_REPORT_POLICY; }
}

export function schoolReportPhaseLabel(policy: SchoolReportPolicy, termNumber: number, programme?: string): string {
  const term = String(Math.max(1, Number(termNumber) || 1));
  return policy.programmePhases[programme || '']?.[term] || policy.phases[term] || `Term ${term}`;
}

export function invoiceEnrolmentTolerance(policy: SchoolReportPolicy, enrolled: number): number {
  return Math.max(policy.finance.enrolmentToleranceCount, Math.ceil(enrolled * policy.finance.enrolmentTolerancePercent / 100));
}
