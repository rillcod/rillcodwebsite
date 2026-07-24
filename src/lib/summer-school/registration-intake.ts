/**
 * Single source of truth for special-programme registration intake:
 * prospect matching, tuition/charge math, gateway metadata, and notes tagging.
 */
import { SPECIAL_PAYMENT_TYPE } from '@/lib/registration/enrollment-types';
import { getSummerTotalTuition, getSummerTuitionAmount } from '@/lib/summer-school/pricing';
import { resolveBankTransferSettlement } from '@/lib/summer-school/bank-transfer-amount';
import { isSameSpecialProgramRegistration } from '@/lib/summer-school/balance-prospect';
import {
  getSpecialTotalTuition,
  getSpecialTuitionAmount,
  type SpecialProgramPage,
} from '@/lib/special-programs/types';

export type ProspectRegistrationRow = {
  id: string;
  status: string;
  created_at: string;
  course_interest?: string | null;
  notes?: string | null;
  parent_phone?: string | null;
};

export type RegistrationDuplicateDecision =
  | { kind: 'block_settled'; studentName: string }
  | { kind: 'block_balance'; studentName: string }
  | { kind: 'reuse'; row: ProspectRegistrationRow }
  | { kind: 'create' };

export type ProgramTuitionContext = {
  totalTuition: number;
  defaultCharge: number;
  depositPercent: number;
};

export type RegistrationCharge = {
  chargeAmount: number;
  balanceDue: number;
  effectivePaymentPlan: string;
  totalTuition: number;
};

export type SpecialProgramGatewayMeta = {
  prospect_id: string;
  student_name: string;
  parent_name: string;
  parent_email: string;
  payment_type: typeof SPECIAL_PAYMENT_TYPE;
  payment_plan: string;
  preferred_mode: string;
  total_tuition: number;
  amount_charged: number;
  balance_due: number;
  special_program_page_id: string | null;
  special_program_slug: string | null;
  program_title: string;
};

export function parentPhoneTail(phone: string | null | undefined): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

export function mergeProspectRegistrationRows(
  ...groups: Array<ProspectRegistrationRow[] | null | undefined>
): ProspectRegistrationRow[] {
  const seen = new Set<string>();
  return groups
    .flatMap((group) => group ?? [])
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
}

export function filterSameProgramRegistrations(
  rows: ProspectRegistrationRow[],
  specialPage: Pick<SpecialProgramPage, 'id' | 'title'> | null,
): ProspectRegistrationRow[] {
  return rows.filter((row) => isSameSpecialProgramRegistration(
    { course_interest: row.course_interest ?? null, notes: row.notes ?? null },
    specialPage,
  ));
}

export function classifyRegistrationDuplicate(
  childRegs: ProspectRegistrationRow[],
  enrolledChildId?: string | null,
  studentName?: string,
): RegistrationDuplicateDecision {
  const name = studentName || 'This learner';
  if (enrolledChildId) return { kind: 'block_settled', studentName: name };
  const settled = childRegs.find((row) => ['paid', 'active'].includes(row.status));
  if (settled) return { kind: 'block_settled', studentName: name };
  const owing = childRegs.find((row) => row.status === 'partially_paid');
  if (owing) return { kind: 'block_balance', studentName: name };
  const reusable = childRegs.find((row) => ['unpaid', 'pending_verification'].includes(row.status));
  if (reusable) return { kind: 'reuse', row: reusable };
  return { kind: 'create' };
}

export function resolveProgramTuitionContext(
  specialPage: Pick<SpecialProgramPage, 'online_fee' | 'onsite_fee' | 'deposit_percent'> | null,
  preferredMode: string,
  paymentPlan: string,
): ProgramTuitionContext {
  const totalTuition = specialPage
    ? getSpecialTotalTuition(specialPage, preferredMode)
    : getSummerTotalTuition(preferredMode);
  const defaultCharge = specialPage
    ? getSpecialTuitionAmount(specialPage, preferredMode, paymentPlan)
    : getSummerTuitionAmount(preferredMode, paymentPlan);
  const depositPercent = specialPage ? Number(specialPage.deposit_percent) || 50 : 50;
  return { totalTuition, defaultCharge, depositPercent };
}

export function resolveRegistrationCharge(params: {
  paymentMethod: 'paystack' | 'bank_transfer' | string;
  paymentPlan: string;
  tuition: ProgramTuitionContext;
  transferAmount?: unknown;
}):
  | { ok: true; charge: RegistrationCharge }
  | { ok: false; error: string } {
  const { totalTuition, defaultCharge, depositPercent } = params.tuition;

  if (params.paymentMethod === 'bank_transfer') {
    const settlement = resolveBankTransferSettlement({
      totalTuition,
      declaredAmount: params.transferAmount ?? defaultCharge,
      selectedPlan: params.paymentPlan,
      depositPercent,
    });
    if (!settlement.ok) return settlement;
    return {
      ok: true,
      charge: {
        chargeAmount: settlement.settlement.amount,
        balanceDue: settlement.settlement.balanceDue,
        effectivePaymentPlan: settlement.settlement.effectivePlan,
        totalTuition,
      },
    };
  }

  const balanceDue = params.paymentPlan === 'installment'
    ? Math.max(0, totalTuition - defaultCharge)
    : 0;

  return {
    ok: true,
    charge: {
      chargeAmount: defaultCharge,
      balanceDue,
      effectivePaymentPlan: params.paymentPlan,
      totalTuition,
    },
  };
}

export function buildProspectNotesString(params: {
  studentPhone?: string | null;
  additionalInfo?: string | null;
  whatsappConsent?: boolean;
  isAppEnrolment?: boolean;
  specialPageId?: string | null;
  programTitle: string;
}): string {
  const studentPhoneStr = params.studentPhone ? `[Student Phone: ${params.studentPhone}]` : '';
  let notesStr = `${studentPhoneStr} ${params.additionalInfo || ''}`.trim();
  if (!/\[Parental Consent:/i.test(notesStr)) {
    notesStr = `${notesStr} [Parental Consent: Yes] [WhatsApp Opt-in: ${params.whatsappConsent === true ? 'Yes' : 'No'}]`.trim();
  }
  if (params.isAppEnrolment) {
    notesStr = `${notesStr} [Source: Mobile Application]`.trim();
  }
  if (params.specialPageId && !/\[SpecialPage:/i.test(notesStr)) {
    notesStr = `${notesStr} [SpecialPage: ${params.specialPageId}]`.trim();
  }
  if (!/\[Programme:/i.test(notesStr)) {
    const safeProgrammeTitle = params.programTitle.replace(/[\[\]]/g, '').trim();
    notesStr = `${notesStr} [Programme: ${safeProgrammeTitle}]`.trim();
  }
  return notesStr;
}

export function buildSpecialProgramGatewayMeta(params: {
  prospectId: string;
  studentName: string;
  parentName: string;
  parentEmail: string;
  preferredMode: string;
  programTitle: string;
  specialPage?: Pick<SpecialProgramPage, 'id' | 'slug'> | null;
  charge: RegistrationCharge;
}): SpecialProgramGatewayMeta {
  return {
    prospect_id: params.prospectId,
    student_name: params.studentName,
    parent_name: params.parentName,
    parent_email: params.parentEmail,
    payment_type: SPECIAL_PAYMENT_TYPE,
    payment_plan: params.charge.effectivePaymentPlan,
    preferred_mode: params.preferredMode,
    total_tuition: params.charge.totalTuition,
    amount_charged: params.charge.chargeAmount,
    balance_due: params.charge.balanceDue,
    special_program_page_id: params.specialPage?.id || null,
    special_program_slug: params.specialPage?.slug || null,
    program_title: params.programTitle,
  };
}

export function bankTransferProofMatches(
  meta: Record<string, unknown>,
  proof: { receiptUrl?: string | null; transferReference?: string | null; chargeAmount: number },
): boolean {
  return (
    (proof.receiptUrl != null && meta.receipt_url === proof.receiptUrl) ||
    (proof.transferReference != null && meta.transfer_reference === proof.transferReference) ||
    Number(meta.amount_charged) === proof.chargeAmount
  );
}

export { isSameSpecialProgramRegistration };
