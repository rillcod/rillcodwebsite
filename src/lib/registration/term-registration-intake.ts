import { resolveBankTransferSettlement, resolveBalanceTransferSettlement } from '@/lib/summer-school/bank-transfer-amount';
import { bankTransferProofMatches } from '@/lib/summer-school/registration-intake';
import { TERM_REGISTRATION_BALANCE_PAYMENT_TYPE } from '@/lib/registration/enrollment-types';
import { ONLINE_SCHEDULES, SCHOOL_SCHEDULES } from '@/lib/registration/schedules';

export { TERM_REGISTRATION_BALANCE_PAYMENT_TYPE };

export type TermRegistrationCharge = {
  chargeAmount: number;
  balanceDue: number;
  effectivePaymentPlan: 'full' | 'instalment';
  totalTuition: number;
};

export function resolveTermRegistrationCharge(params: {
  paymentMethod: string;
  paymentPlan: string;
  totalTuition: number;
  transferAmount?: unknown;
}): { ok: true; charge: TermRegistrationCharge } | { ok: false; error: string } {
  const totalTuition = Math.round(Number(params.totalTuition) || 0);
  if (totalTuition <= 0) {
    return { ok: false, error: 'Programme fee is not configured. Please contact support.' };
  }

  const isInstalment = params.paymentPlan === 'instalment' || params.paymentPlan === 'installment';

  if (params.paymentMethod === 'bank_transfer') {
    const settlement = resolveBankTransferSettlement({
      totalTuition,
      declaredAmount: params.transferAmount,
      selectedPlan: params.paymentPlan,
      depositPercent: isInstalment ? 50 : 100,
    });
    if (!settlement.ok) return settlement;
    return {
      ok: true,
      charge: {
        chargeAmount: settlement.settlement.amount,
        balanceDue: settlement.settlement.balanceDue,
        effectivePaymentPlan: settlement.settlement.effectivePlan === 'installment' ? 'instalment' : 'full',
        totalTuition,
      },
    };
  }

  const chargeAmount = isInstalment ? Math.round(totalTuition * 0.5) : totalTuition;
  const balanceDue = isInstalment ? totalTuition - chargeAmount : 0;
  return {
    ok: true,
    charge: {
      chargeAmount,
      balanceDue,
      effectivePaymentPlan: isInstalment ? 'instalment' : 'full',
      totalTuition,
    },
  };
}

export function resolveTermBalancePaymentCharge(params: {
  paymentMethod: string;
  outstandingBalance: number;
  totalTuition: number;
  amountPaidSoFar: number;
  transferAmount?: unknown;
}): { ok: true; charge: { chargeAmount: number; balanceDue: number } } | { ok: false; error: string } {
  const outstandingBalance = Math.round(Number(params.outstandingBalance) || 0);
  if (outstandingBalance <= 0) {
    return { ok: false, error: 'Registration balance is already fully paid — thank you!' };
  }

  if (params.paymentMethod === 'bank_transfer') {
    const settlement = resolveBalanceTransferSettlement({
      outstandingBalance,
      totalTuition: params.totalTuition,
      amountPaidSoFar: params.amountPaidSoFar,
      declaredAmount: params.transferAmount,
    });
    if (!settlement.ok) return settlement;
    return {
      ok: true,
      charge: {
        chargeAmount: settlement.settlement.amount,
        balanceDue: settlement.settlement.balanceDue,
      },
    };
  }

  return {
    ok: true,
    charge: { chargeAmount: outstandingBalance, balanceDue: 0 },
  };
}

export function buildTermRegistrationGatewayMeta(params: {
  studentId: string;
  studentName: string;
  parentName?: string | null;
  parentEmail: string;
  enrollmentType: string;
  programName?: string | null;
  schoolName?: string | null;
  charge: TermRegistrationCharge;
  partnerProgramTrack?: string | null;
  rcCode?: string | null;
  programId?: string | null;
  termsAcceptedAt?: string | null;
}): Record<string, unknown> {
  return {
    student_id: params.studentId,
    student_name: params.studentName,
    parent_name: params.parentName ?? null,
    parent_email: params.parentEmail,
    enrollment_type: params.enrollmentType,
    program_name: params.programName ?? null,
    school_name: params.schoolName ?? null,
    payment_type: 'registration',
    payment_plan: params.charge.effectivePaymentPlan,
    total_tuition: params.charge.totalTuition,
    amount_charged: params.charge.chargeAmount,
    balance_due: params.charge.balanceDue,
    partner_program_track: params.partnerProgramTrack ?? null,
    rc_code: params.rcCode ?? null,
    program_id: params.programId ?? null,
    terms_accepted_at: params.termsAcceptedAt ?? null,
    terms_version: params.termsAcceptedAt ? 'registration-2026-07' : null,
  };
}

export function buildTermBalanceGatewayMeta(params: {
  studentId: string;
  studentName: string;
  parentEmail: string;
  enrollmentType: string;
  programName?: string | null;
  totalTuition: number;
  amountPaidSoFar: number;
  chargeAmount: number;
  balanceDue: number;
}): Record<string, unknown> {
  return {
    student_id: params.studentId,
    student_name: params.studentName,
    parent_email: params.parentEmail,
    enrollment_type: params.enrollmentType,
    program_name: params.programName ?? null,
    payment_type: TERM_REGISTRATION_BALANCE_PAYMENT_TYPE,
    balance_payment: true,
    total_tuition: params.totalTuition,
    amount_charged: params.chargeAmount,
    balance_due: params.balanceDue,
    amount_paid_before: params.amountPaidSoFar,
  };
}

export { bankTransferProofMatches };

export function normalizeTermPaymentPlan(plan: unknown): 'full' | 'instalment' {
  const p = String(plan || 'full').trim().toLowerCase();
  return p === 'instalment' || p === 'installment' ? 'instalment' : 'full';
}
export type TermRegistrationValidationInput = {
  enrollmentType: string;
  fullName: unknown;
  dateOfBirth: unknown;
  gender: unknown;
  gradeLevel: unknown;
  parentName: unknown;
  parentPhone: unknown;
  courseInterest: unknown;
  preferredSchedule: unknown;
  termsAgreement: unknown;
};

/** Server-side mirror of the public form gates; browser validation is never authoritative. */
export function validateTermRegistrationIntake(input: TermRegistrationValidationInput): string | null {
  const required: Array<[unknown, string]> = [
    [input.fullName, 'Learner name'],
    [input.dateOfBirth, 'Date of birth'],
    [input.gender, 'Gender'],
    [input.gradeLevel, 'Class or grade'],
    [input.parentName, 'Parent or guardian name'],
    [input.parentPhone, 'Parent or guardian phone'],
    [input.courseInterest, 'Programme'],
    [input.preferredSchedule, 'Schedule'],
  ];
  const missing = required.find(([value]) => !String(value ?? '').trim());
  if (missing) return `${missing[1]} is required.`;
  if (input.termsAgreement !== true) return 'Please accept the registration terms to continue.';

  const gender = String(input.gender).trim().toLowerCase();
  if (!['male', 'female'].includes(gender)) return 'Choose a valid gender.';

  const phoneDigits = String(input.parentPhone).replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return 'Enter a valid parent or guardian phone number.';

  const birthDate = new Date(String(input.dateOfBirth));
  if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now()) return 'Enter a valid date of birth.';

  const schedules = input.enrollmentType === 'school' ? SCHOOL_SCHEDULES : ONLINE_SCHEDULES;
  if (!schedules.some((schedule) => schedule.value === String(input.preferredSchedule).trim())) {
    return 'Choose a schedule available for this enrollment pathway.';
  }
  return null;
}

