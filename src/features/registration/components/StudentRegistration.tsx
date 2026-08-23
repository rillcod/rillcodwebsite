'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { fetchActionJson } from '@/lib/async-timeout';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Check, ArrowRight, ArrowLeft, Loader2,
  Phone, Mail, School, BookOpen, Calendar, ChevronDown, MapPin,
  Heart, Globe, Sun, Building2, ShieldCheck, CreditCard, Upload,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  SCHOOL_PROGRAMME_OPTIONS,
  SPECIALIST_PROGRAMME_OPTIONS,
  RETENTION_PITCH,
  REGISTRATION_GRADE_OPTIONS,
  REGISTRATION_HEAR_ABOUT_OPTIONS,
  PARTNER_SCHOOL_TERM_FEE_LABEL,
} from '@/lib/registration/programme-map';
import {
  STUDENT_REGISTRATION_PATH,
  TERM_BALANCE_PATH,
  TERM_ENROLLMENT_TYPES,
  type TermEnrollmentType,
} from '@/lib/registration/enrollment-types';
import { isAllowedReceiptFile, receiptAcceptAttribute } from '@/lib/summer-school/receipt-upload';
import { resolveBankTransferSettlement } from '@/lib/summer-school/bank-transfer-amount';
import { BankTransferAmountField } from '@/components/summer-school/BankTransferAmountField';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { useContactCapture } from '@/hooks/useContactCapture';
import { consumeStudentPrefill } from '@/lib/whatsapp/mini-intake';
import {
  ONLINE_SCHEDULES,
  SCHOOL_SCHEDULES,
  ONLINE_LIVE_SCHEDULE,
  ONLINE_WEEKEND_SCHEDULE,
  typeFeeLabel,
} from '@/lib/registration/schedules';

// ─── Term chooser (special / Summer onsite is a separate door) ───
const ENROLLMENT_TYPES = [
  {
    id: 'school' as const,
    icon: Building2,
    title: 'Partner School',
    desc: 'Term classes at your child’s Rillcod partner school',
    help: 'Best if your school already runs Young Innovators or Teen Developers.',
    fee: PARTNER_SCHOOL_TERM_FEE_LABEL,
    accent: 'from-sky-500/20 via-transparent to-transparent border-sky-500/35 hover:border-sky-400/60',
    iconWrap: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/25',
    cta: 'Enrol at school',
  },
  {
    id: 'online' as const,
    icon: Globe,
    title: 'Online School',
    desc: 'Live term classes from home on a fixed weekly timetable',
    help: 'Kids, teens, adults & individuals — Wed/Fri evenings or weekend slots.',
    fee: 'From ₦25,000 / term',
    accent: 'from-emerald-500/20 via-transparent to-transparent border-emerald-500/35 hover:border-emerald-400/60',
    iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    cta: 'Enrol online',
  },
] as const;

type EnrollmentType = TermEnrollmentType | '';

function parseTermEnrollmentTypeParam(raw: string | null | undefined): EnrollmentType {
  const v = String(raw || '').trim().toLowerCase();
  if ((TERM_ENROLLMENT_TYPES as readonly string[]).includes(v)) {
    return v as TermEnrollmentType;
  }
  return '';
}

function isSpecialTypeParam(raw: string | null | undefined): boolean {
  const v = String(raw || '').trim().toLowerCase();
  return v === 'special' || v === 'bootcamp' || v === 'summer_school' || v === 'summer';
}

function isInPersonTypeParam(raw: string | null | undefined): boolean {
  const v = String(raw || '').trim().toLowerCase();
  return v === 'in_person' || v === 'in-person' || v === 'centre' || v === 'center';
}

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

// ─── Shared helpers ────────────────────────────────────────────────
/**
 * The caption sat next to the control with nothing joining them, so every field on
 * the enrolment form announced as an unlabelled edit box and the caption was not a
 * click target. The control is passed in as children, so the id is generated here
 * and injected into it rather than repeated at eighteen call sites — a call site
 * that already sets its own id keeps it.
 */
function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  const generatedId = React.useId();
  const child = React.isValidElement(children) ? children : null;
  const childId = (child?.props as { id?: string } | undefined)?.id;
  const fieldId = childId ?? generatedId;
  const labelled = child && !childId
    ? React.cloneElement(child as React.ReactElement<{ id?: string }>, { id: fieldId })
    : children;

  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none z-10" />}
        {labelled}
      </div>
    </div>
  );
}

const inputCls = (hasIcon = true) =>
  `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-6 py-4 sm:py-5 bg-background/80 border border-border rounded-xl text-sm font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`;

const selectCls = (hasIcon = false) =>
  `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-10 py-4 sm:py-5 bg-background/80 border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer`;

// ─── Default form state ────────────────────────────────────────────
const defaultForm = {
  enrollmentType: '' as EnrollmentType,
  fullName: '', dateOfBirth: '', grade: '', currentSchool: '', partnerSchoolId: '', gender: '',
  city: '', state: '', studentEmail: '',
  parentName: '', parentPhone: '', parentEmail: '', parentRelationship: '',
  courseInterest: '', preferredSchedule: '', hearAboutUs: '',
  termsAgreement: false,
  rcCode: '',
};

// ─── Schedule options per type ────────────────────────────────────
function getSchoolSchedules(_courseInterest: string) {
  return SCHOOL_SCHEDULES;
}

// ─── Main component ───────────────────────────────────────────────
export function StudentRegistration({ defaultEnrollmentType }: { defaultEnrollmentType?: EnrollmentType }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const formAnchorRef = useRef<HTMLDivElement>(null);
  const { cta: specialCta, loaded: specialLoaded, open: specialOpen } = useFeaturedSpecialProgram();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');
  const [existingLearnerNext, setExistingLearnerNext] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [autoOnboarded, setAutoOnboarded] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [form, setForm] = useState(defaultForm);
  const isNativeApp = useIsNativeApp();
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState('');
  const [rcVerified, setRcVerified] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
  const [rcCardName, setRcCardName] = useState('');
  const [rcError, setRcError] = useState('');
  const [registrationReference, setRegistrationReference] = useState('');
  const [paymentEmailSent, setPaymentEmailSent] = useState(false);
  const [emailDeliveryError, setEmailDeliveryError] = useState('');
  const [resendingPaymentEmail, setResendingPaymentEmail] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'bank_transfer'>('paystack');
  const [paymentPlan, setPaymentPlan] = useState<'full' | 'instalment'>('full');
  const [transferAmount, setTransferAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{ bank_name: string; account_number: string; account_name: string; label?: string }>>([]);
  const [bankTransferSubmitted, setBankTransferSubmitted] = useState(false);
  const [submittedBalanceDue, setSubmittedBalanceDue] = useState<number | null>(null);
  const [submittedAmountPaid, setSubmittedAmountPaid] = useState<number | null>(null);
  const [instalmentsEnabled, setInstalmentsEnabled] = useState<boolean | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const programIdParam = searchParams?.get('program_id') || null;

  const getCapturePayload = useCallback(() => {
    const partnerSchool = schools.find(s => s.id === form.partnerSchoolId);
    return {
      fullName: form.parentName || form.fullName,
      parentName: form.parentName,
      email: form.parentEmail,
      phone: form.parentPhone,
      studentName: form.fullName,
      childName: form.fullName,
      grade: form.grade,
      schoolName: form.enrollmentType === 'school' ? partnerSchool?.name : form.currentSchool,
      enrollmentType: form.enrollmentType,
      courseInterest: form.courseInterest,
      preferredSchedule: form.preferredSchedule,
      hearAboutUs: form.hearAboutUs,
    };
  }, [form, schools]);

  const { scheduleCapture, captureOnBlur, captureSubmitted, capturePaymentStarted } = useContactCapture({
    formType: 'portal_registration',
    getPayload: getCapturePayload,
    enabled: !submitted && !paymentVerified,
  });

  const selectPath = (id: TermEnrollmentType) => {
    setForm((p) => ({
      ...p,
      enrollmentType: id,
      preferredSchedule: '',
    }));
    setErr('');
    const qs = new URLSearchParams(searchParams?.toString() || '');
    qs.set('type', id);
    router.replace(`${STUDENT_REGISTRATION_PATH}?${qs.toString()}`, { scroll: false });
  };

  const clearPath = () => {
    setForm((p) => ({
      ...p,
      enrollmentType: '',
      preferredSchedule: '',
      courseInterest: '',
    }));
    setErr('');
    const qs = new URLSearchParams(searchParams?.toString() || '');
    qs.delete('type');
    router.replace(qs.toString() ? `${STUDENT_REGISTRATION_PATH}?${qs.toString()}` : STUDENT_REGISTRATION_PATH, { scroll: false });
  };

  useEffect(() => {
    let active = true;
    const loadPartnerSchools = async () => {
      setSchoolsLoading(true);
      setSchoolsError('');
      const { data, error } = await createClient()
        .from('schools')
        .select('id, name')
        .eq('status', 'approved')
        .order('name');
      if (!active) return;
      if (error) {
        setSchools([]);
        setSchoolsError('Partner schools could not be loaded. Please refresh and try again.');
      } else {
        setSchools(data ?? []);
      }
      setSchoolsLoading(false);
    };
    void loadPartnerSchools();
    return () => { active = false; };
  }, []);

  // Dynamic program resolution from URL query parameters (?program=..., ?course=..., ?track=..., ?program_id=...)
  useEffect(() => {
    const rawProgram = searchParams?.get('program') || searchParams?.get('course') || searchParams?.get('track') || searchParams?.get('title') || searchParams?.get('program_id') || null;
    if (!rawProgram) return;

    const trimmed = rawProgram.trim();
    const lower = trimmed.toLowerCase();
    const allOptions = [...SCHOOL_PROGRAMME_OPTIONS, ...SPECIALIST_PROGRAMME_OPTIONS];

    // Find best match in canonical options
    const matched = allOptions.find(o => 
      o.value.toLowerCase() === lower || 
      o.label.toLowerCase() === lower || 
      (o as any).match?.some((m: string) => lower.includes(m))
    );

    const resolvedValue = matched ? matched.value : trimmed;

    setForm((prev) => {
      if (prev.courseInterest) return prev; // Keep if user manually modified
      const isSchoolOption = SCHOOL_PROGRAMME_OPTIONS.some(s => s.value === resolvedValue);
      return {
        ...prev,
        courseInterest: resolvedValue,
        enrollmentType: prev.enrollmentType || (isSchoolOption ? 'school' : 'online'),
      };
    });
  }, [searchParams]);

  useEffect(() => {
    if (isNativeApp || !form.enrollmentType) {
      setInstalmentsEnabled(false);
      return;
    }
    let active = true;
    const qs = programIdParam ? `?program_id=${encodeURIComponent(programIdParam)}` : '';
    fetchActionJson<{ instalmentsEnabled: boolean }>(
      `/api/payments/registration/instalment-options${qs}`,
      {},
      'Could not load payment options.',
    ).then(({ data }) => {
      if (!active) return;
      const enabled = data.instalmentsEnabled === true;
      setInstalmentsEnabled(enabled);
      if (!enabled) setPaymentPlan('full');
    }).catch(() => {
      if (active) setInstalmentsEnabled(false);
    });
    return () => { active = false; };
  }, [programIdParam, form.enrollmentType, isNativeApp]);

  useEffect(() => {
    const prefill = consumeStudentPrefill();
    if (!prefill) return;
    setForm((p) => ({
      ...p,
      parentName: prefill.parentName || p.parentName,
      parentPhone: prefill.parentPhone || p.parentPhone,
      fullName: prefill.fullName || p.fullName,
    }));
  }, []);

  useEffect(() => {
    if (!specialLoaded || !specialCta.registerHref) return;
    // Only hand somebody over to the special programme while it is still taking
    // registrations. Once it closes, they stay here on a form that works.
    if (!specialOpen) return;
    const t = searchParams?.get('type');
    if (!isSpecialTypeParam(t) && !isInPersonTypeParam(t)) return;
    window.location.replace(specialCta.registerHref);
  }, [specialLoaded, specialOpen, specialCta.registerHref, searchParams]);

  useEffect(() => {
    const urlType = parseTermEnrollmentTypeParam(searchParams?.get('type'));
    const propType = parseTermEnrollmentTypeParam(defaultEnrollmentType);
    const nextType = (propType || urlType || '') as EnrollmentType;
    if (nextType && form.enrollmentType !== nextType) {
      setForm(p => ({
        ...p,
        enrollmentType: nextType,
      }));
    }
  }, [defaultEnrollmentType, searchParams, form.enrollmentType]);

  useEffect(() => {
    if (!form.enrollmentType) return;
    const t = window.setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [form.enrollmentType]);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name === 'courseInterest' && form.enrollmentType === 'school') {
      setForm(p => ({ ...p, courseInterest: value, preferredSchedule: '' }));
    } else {
      setForm(p => ({ ...p, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
    }
    scheduleCapture(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.termsAgreement) { setErr('Please accept the terms to continue.'); return; }
    if (form.enrollmentType === 'school' && !form.partnerSchoolId) {
      setErr("Please select the learner's partner school.");
      return;
    }
    setLoading(true); setErr('');
    setExistingLearnerNext('');
    captureSubmitted();

    if (form.enrollmentType === 'school' && form.preferredSchedule === 'Holiday Programme') {
      if (!form.rcCode.trim()) {
        setErr('Registration Code (RC) is required for the Holiday Programme.');
        setLoading(false);
        return;
      }
      if (rcVerified !== 'valid') {
        setLoading(true);
        setErr('');
        setRcVerified('verifying');
        try {
          const { response, data } = await fetchActionJson<{
            valid: boolean; result: string; error: string;
            card: { holder_name: string };
          }>(`/api/cards/verify-public?code=${encodeURIComponent(form.rcCode.trim())}`);
          if (response.ok && data.valid && data.result === 'ok') {
            setRcVerified('valid');
            setRcCardName(data.card?.holder_name || 'Active Partner Student');
          } else {
            setRcVerified('invalid');
            const errorMsg = (typeof data.error === 'string' && data.error)
              ? data.error
              : 'Invalid or inactive Registration Code (RC). Only active partner students qualify for the subsidy.';
            setRcError(errorMsg);
            setErr(errorMsg);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('RC code verification request failed', err);
          const msg = err instanceof Error && err.message.includes('taking longer')
            ? err.message
            : 'Could not verify your Registration Code. Please check your connection and try again.';
          setRcVerified('invalid');
          setRcError(msg);
          setErr(msg);
          setLoading(false);
          return;
        }
      }
    }

    const programId = searchParams?.get('program_id') || null;
    const isSelf = form.parentRelationship === 'Self';
    const contactEmail = form.parentEmail.trim().toLowerCase();
    const studentEmail =
      form.studentEmail?.trim() ||
      (isSelf && contactEmail ? contactEmail : null);

    try {
      const { response, data } = await fetchActionJson<{
        code: string; next: string; error: string; paymentMethod: string;
        reference: string; paymentEmailSent: boolean; paymentEmailError: string;
        paymentUrl: string; balanceDue: number; amountPaid: number;
      }>('/api/payments/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_type: form.enrollmentType,
          full_name: form.fullName,
          date_of_birth: form.dateOfBirth || null,
          gender: form.gender.toLowerCase(),
          grade_level: form.grade,
          school_id: form.enrollmentType === 'school' ? form.partnerSchoolId : null,
          origin_school_name: form.enrollmentType === 'online' ? form.currentSchool || null : null,
          city: form.city,
          state: form.state,
          student_email: studentEmail,
          parent_name: form.parentName,
          parent_phone: form.parentPhone,
          parent_email: contactEmail,
          parent_relationship: form.parentRelationship,
          course_interest: form.courseInterest,
          preferred_schedule: form.preferredSchedule,
          heard_about_us: form.hearAboutUs,
          rc_code: form.rcCode,
          is_app_enrolment: isNativeApp,
          payment_method: isNativeApp ? 'other' : paymentMethod,
          payment_plan: paymentPlan,
          payment_reference: paymentMethod === 'bank_transfer' ? paymentReference.trim() : undefined,
          transfer_amount: paymentMethod === 'bank_transfer' ? transferAmount : undefined,
          terms_agreement: form.termsAgreement,
          ...(programId ? { program_id: programId } : {}),
          return_path: STUDENT_REGISTRATION_PATH,
        }),
        // Generous timeout — registration writes take longer than reads.
      }, 'Registration is taking longer than expected. Your details are saved; please check your connection and try again.', 20_000);
      if (!response.ok && data.code === 'EXISTING_LEARNER' && typeof data.next === 'string') {
        setExistingLearnerNext(data.next);
      }
      if (!response.ok) {
        if (response.status >= 500) console.error('Registration submission failed', { status: response.status, data });
        throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Submission failed. Please try again.');
      }
      if (isNativeApp || data.paymentMethod === 'bank_transfer') {
        setRegistrationReference(String(data.reference || ''));
        setPaymentEmailSent(data.paymentEmailSent === true);
        setBankTransferSubmitted(data.paymentMethod === 'bank_transfer');
        setSubmittedBalanceDue(typeof data.balanceDue === 'number' ? data.balanceDue : null);
        setSubmittedAmountPaid(typeof data.amountPaid === 'number' ? data.amountPaid : null);
        setEmailDeliveryError(
          typeof data.paymentEmailError === 'string'
            ? data.paymentEmailError
            : data.paymentEmailSent === true
              ? ''
              : 'The payment email was not delivered. You can resend it below.',
        );
        setSubmitted(true);
        setLoading(false);
      } else {
        capturePaymentStarted();
        window.location.href = data.paymentUrl as string;
      }
    } catch (e: unknown) {
      console.error('Student registration submission request failed', e);
      setErr(
        e instanceof Error && (e.message.includes('taking longer') || e.message.includes('connection'))
          ? e.message
          : e instanceof Error && e.message
            ? e.message
            : 'We could not submit your registration. Please check your connection and try again.',
      );
      setLoading(false);
    }
  };

  const resendPaymentEmail = async () => {
    if (!registrationReference || !form.parentEmail.trim()) return;
    setResendingPaymentEmail(true);
    setEmailDeliveryError('');
    try {
      const { response, data } = await fetchActionJson<{ delivered: boolean; error: string }>(
        '/api/payments/registration/resend-link',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: registrationReference,
            email: form.parentEmail.trim().toLowerCase(),
          }),
        },
        'The resend request is taking longer than expected. Please try again.',
      );
      if (!response.ok || data.delivered !== true) {
        if (response.status >= 500) console.error('Resend payment email failed', { status: response.status, data });
        throw new Error('The payment email could not be resent. Please try again.');
      }
      setPaymentEmailSent(true);
    } catch (error: unknown) {
      console.error('Resend payment email request failed', error);
      setEmailDeliveryError(
        error instanceof Error && error.message
          ? error.message
          : 'The payment email could not be resent.',
      );
    } finally {
      setResendingPaymentEmail(false);
    }
  };

  const paymentStatus = searchParams?.get('payment');
  const paymentRef = searchParams?.get('reference');
  const et = form.enrollmentType;

  const schedules = useMemo(() => {
    if (et === 'school') return getSchoolSchedules(form.courseInterest);
    if (et === 'online') return ONLINE_SCHEDULES;
    return [];
  }, [et, form.courseInterest]);

  const selectedSchedule = schedules.find(s => s.value === form.preferredSchedule);
  const tuitionTotal = selectedSchedule?.fee ?? 0;
  const suggestedDeposit = paymentPlan === 'instalment' ? Math.round(tuitionTotal * 0.5) : tuitionTotal;

  const bankTransferSettlement = useMemo(() => {
    if (paymentMethod !== 'bank_transfer' || !tuitionTotal) return null;
    return resolveBankTransferSettlement({
      totalTuition: tuitionTotal,
      declaredAmount: transferAmount,
      selectedPlan: paymentPlan,
      depositPercent: 50,
    });
  }, [paymentMethod, transferAmount, paymentPlan, tuitionTotal]);

  const bankTransferReady =
    paymentMethod !== 'bank_transfer' ||
    (bankTransferSettlement?.ok === true && paymentReference.trim().length > 0 && !uploadingReceipt);

  useEffect(() => {
    if (isNativeApp || bankAccounts.length) return;
    createClient()
      .from('payment_accounts')
      .select('bank_name, account_number, account_name, label')
      .eq('is_active', true)
      .in('owner_type', ['rillcod', 'global'])
      .then(({ data }) => setBankAccounts(data ?? []));
  }, [isNativeApp, bankAccounts.length]);

  useEffect(() => {
    if (paymentMethod !== 'bank_transfer' || !tuitionTotal) return;
    setTransferAmount((prev) => (prev.trim() ? prev : String(suggestedDeposit)));
  }, [paymentMethod, paymentPlan, tuitionTotal, suggestedDeposit]);

  const handleReceiptUpload = async (file: File) => {
    if (!isAllowedReceiptFile(file)) {
      setErr('Please upload a receipt image (PNG, JPG, HEIC) or PDF.');
      return;
    }
    setUploadingReceipt(true);
    try {
      const body = new FormData();
      body.append('file', file);
      if (paymentReference.startsWith('http') || paymentReference.startsWith('/')) {
        body.append('previousUrl', paymentReference);
      }
      const { response, data } = await fetchActionJson<{ url: string; error: string }>(
        '/api/summer-school/receipt',
        { method: 'POST', body },
        'Receipt upload is taking longer than expected. Please try again.',
        30_000,
      );
      if (!response.ok) {
        if (response.status >= 500) console.error('Receipt upload failed', { status: response.status, data });
        throw new Error('Receipt upload failed. Please try a smaller file or check your connection.');
      }
      setPaymentReference(data.url as string);
    } catch (e: unknown) {
      console.error('Receipt upload request failed', e);
      setErr(
        e instanceof Error && e.message
          ? e.message
          : 'Receipt upload failed. Please try again.',
      );
    } finally {
      setUploadingReceipt(false);
    }
  };

  useEffect(() => {
    if (paymentStatus !== 'success' || !paymentRef) return;
    let cancelled = false;

    setVerifyingPayment(true);
    setPaymentError('');

    void (async () => {
      try {
        const { response, data } = await fetchActionJson<{
          ok: boolean; error: string; autoOnboarded: boolean;
        }>(
          `/api/payments/registration/verify?reference=${encodeURIComponent(paymentRef)}`,
          {},
          'Payment verification is taking longer than expected. Please wait or contact support.',
        );
        if (cancelled) return;
        if (!response.ok || !data.ok) {
          if (response.status >= 500) console.error('Payment verify backend error', { status: response.status, data });
          setPaymentError(
            response.status < 500 && typeof data.error === 'string' && data.error
              ? data.error
              : 'Payment could not be verified. Please contact support if you were charged.',
          );
          return;
        }
        setPaymentVerified(true);
        setAutoOnboarded(!!data.autoOnboarded);
      } catch (e: unknown) {
        if (cancelled) return;
        console.error('Payment verify request failed', e);
        setPaymentError(
          e instanceof Error && e.message
            ? e.message
            : 'Payment verification failed. Please contact support.',
        );
      } finally {
        if (!cancelled) setVerifyingPayment(false);
      }
    })();

    return () => { cancelled = true; };
  }, [paymentStatus, paymentRef]);

  const selectedProgramObj = useMemo(() => {
    if (!form.courseInterest) return null;
    const allOptions = [...SCHOOL_PROGRAMME_OPTIONS, ...SPECIALIST_PROGRAMME_OPTIONS];
    const opt = allOptions.find(o => o.value === form.courseInterest || o.label === form.courseInterest);
    return {
      name: form.courseInterest,
      label: opt?.label || form.courseInterest,
    };
  }, [form.courseInterest]);

  if (submitted) {
    return (
      <div className="bg-card border border-border/80 p-8 sm:p-12 text-center shadow-2xl rounded-2xl border-t-4 border-t-emerald-500 max-w-md mx-auto relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 rounded-full ring-8 ring-emerald-500/5 animate-pulse">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          
          <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight leading-tight">
            Welcome to the Future of STEM! 🚀
          </h2>
          
          <p className="text-xs sm:text-sm text-muted-foreground mt-4 leading-relaxed font-medium">
            {bankTransferSubmitted
              ? 'Your registration and bank transfer proof are with our team for verification.'
              : "Your learner's coding adventure is about to begin. We are setting up their digital lab!"}
          </p>
          
          <div className={`mt-6 p-4 rounded-xl text-left space-y-2 border ${paymentEmailSent ? 'bg-muted/40 border-border/60' : 'bg-amber-500/10 border-amber-500/30'}`}>
            <p className={`text-[11px] leading-relaxed ${paymentEmailSent ? 'text-muted-foreground' : 'font-bold text-amber-600 dark:text-amber-300'}`}>
              {paymentEmailSent
                ? bankTransferSubmitted
                  ? 'Verification in progress — confirmation sent to:'
                  : isNativeApp
                  ? 'Enrolment request confirmation sent to:'
                  : 'Secure payment instructions were sent to:'
                : isNativeApp
                  ? 'Your enrolment request is saved, but the confirmation email was not delivered.'
                  : 'Your registration is saved, but the payment email was not delivered.'}
            </p>
            <p className="text-xs font-black text-primary truncate pl-1">
              {form.parentEmail}
            </p>
            {paymentEmailSent ? (
              <p className="text-[10px] text-muted-foreground/60 leading-normal pt-1 border-t border-border/30">
                Check Inbox, Promotions and Spam. Use your registration reference if you contact support.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground leading-normal">{emailDeliveryError}</p>
                <button
                  type="button"
                  onClick={resendPaymentEmail}
                  disabled={resendingPaymentEmail}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-50"
                >
                  {resendingPaymentEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  {resendingPaymentEmail ? 'Resending...' : isNativeApp ? 'Resend enrolment email' : 'Resend payment email'}
                </button>
              </>
            )}
          </div>

          {submittedBalanceDue != null && submittedBalanceDue > 0 && (
            <div className="mt-6 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-left">
              <p className="text-xs font-black text-amber-500 uppercase tracking-wide">Balance remaining after verification</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                {submittedAmountPaid != null && submittedAmountPaid > 0 ? (
                  <>
                    Once your transfer of <strong className="text-foreground">₦{submittedAmountPaid.toLocaleString()}</strong> is verified,
                    the remaining balance is <strong className="text-foreground">₦{submittedBalanceDue.toLocaleString()}</strong>.
                  </>
                ) : (
                  <>
                    Your remaining balance is <strong className="text-foreground">₦{submittedBalanceDue.toLocaleString()}</strong>.
                  </>
                )}{' '}
                Pay before week 3 on the{' '}
                <Link
                  href={`${TERM_BALANCE_PATH}?email=${encodeURIComponent(form.parentEmail.trim().toLowerCase())}`}
                  className="text-primary font-bold hover:underline"
                >
                  balance payment page
                </Link>.
              </p>
            </div>
          )}
          
          <div className="mt-8">
            <Link href="/login" className="flex items-center justify-center gap-2 w-full py-4 bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20">
              Go to Portal Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (paymentStatus === 'success') {
    return (
      <div className="bg-card border border-border p-12 text-center shadow-2xl rounded-none border-t-4 border-t-emerald-500">
         <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8 rounded-none">
            {verifyingPayment ? <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /> : <Check className="w-10 h-10 text-emerald-500" />}
         </div>
         <h2 className="text-3xl font-black text-foreground uppercase tracking-tight mb-4">
           {verifyingPayment ? 'Verifying Payment' : paymentVerified ? 'Confirmed' : 'Verification Needed'}
         </h2>
         <p className="text-muted-foreground font-medium mb-6 max-w-lg mx-auto">
           {verifyingPayment
             ? 'Please wait while we confirm your payment with Paystack.'
             : paymentVerified
               ? autoOnboarded
                 ? 'Payment confirmed. Your portal login has been emailed — you can start learning in the Rillcod system right away.'
                 : 'Payment confirmed. Our team will activate portal access shortly — then you keep learning term after term in the same Rillcod system.'
               : paymentError || 'We could not verify this payment yet. Please contact support if you were charged.'}
         </p>
         {paymentVerified && (
           <div className="mb-8 max-w-lg mx-auto border border-primary/20 bg-primary/5 p-5 text-left">
             <p className="text-[10px] font-black uppercase tracking-widest text-primary">{RETENTION_PITCH.heading}</p>
             <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{RETENTION_PITCH.body}</p>
             <div className="flex flex-col sm:flex-row gap-2 mt-4">
               {specialOpen && specialCta.slug ? (
                 <a href={specialCta.registerHref} className="px-4 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest text-center">
                   {RETENTION_PITCH.ctaSpecial}
                 </a>
               ) : null}
               <Link href="/programs" className="px-4 py-3 border border-border text-[10px] font-black uppercase tracking-widest text-center hover:bg-muted">
                 Explore programmes
               </Link>
             </div>
           </div>
         )}
         {paymentRef ? (
           <p className="text-[11px] font-mono text-muted-foreground/80 mb-8 break-all">Payment reference: <span className="text-foreground">{paymentRef}</span></p>
         ) : null}
         <button onClick={() => { window.location.href = isNativeApp ? '/login' : '/'; }} className="px-10 py-5 bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-emerald-600 transition-all">{isNativeApp ? 'Continue to sign in' : 'Return to Home'}</button>
      </div>
    );
  }

  const isAdultLearner = form.grade === 'Adult' || form.grade === 'Individual';
  const feeAmount = selectedSchedule ? `₦${selectedSchedule.fee.toLocaleString()}` : '';

  return (
    <div className="w-full relative py-4 sm:py-8">
        {/* Exit control */}
        <div className="sticky top-0 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 mb-6 sm:mb-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 py-3 bg-background/80 backdrop-blur-xl border-b border-border/80 sm:rounded-2xl sm:border sm:px-4">
            {isNativeApp ? (
              <span className="w-[5.5rem]" aria-hidden />
            ) : (
              <Link
                href="/"
                className="inline-flex items-center gap-2 min-h-11 px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                Back to home
              </Link>
            )}
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/80 hidden sm:block">
              RILLCOD<span className="text-brand-red-600">.</span>
            </p>
            {et ? (
              <button
                type="button"
                onClick={clearPath}
                className="inline-flex items-center gap-2 min-h-11 px-3 text-[10px] font-black uppercase tracking-widest text-primary hover:opacity-80 transition-opacity touch-manipulation"
              >
                Change path
              </button>
            ) : (
              <span className="w-[5.5rem] sm:hidden" aria-hidden />
            )}
          </div>
        </div>

        {/* Header */}
        {!et && (
        <header className="text-center mb-10 sm:mb-12 max-w-3xl mx-auto bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 sm:p-12 shadow-xl relative overflow-hidden">
          <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-block px-4 py-1.5 bg-brand-red-accent text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm mb-4">
              Official STEM Admission
            </span>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground leading-[1.05] tracking-tight uppercase mb-4">
              Enrol a <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-brand-red-600">learner</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto font-medium leading-relaxed italic">
              {isNativeApp ? 'Choose a learning path and submit the learner details. Enrolment updates will be sent to your email.' : 'Select your enrollment path to complete your registration in one straightforward form.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {(isNativeApp ? ['Simple enrolment', 'Kids → adults', 'Term-on-term portal'] : ['Secure payment', 'Kids → adults', 'Term-on-term portal']).map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/80 bg-background/80 text-[10px] font-black uppercase tracking-widest text-muted-foreground shadow-sm"
                >
                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </header>
        )}

        {/* Term path chooser */}
        {!et && (
        <section className="mb-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.35em] mb-5 text-center">
            How will you attend?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {ENROLLMENT_TYPES.map((t, idx) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectPath(t.id)}
                  style={{ animationDelay: `${idx * 80}ms` }}
                  className={`group relative flex flex-col items-start gap-4 p-6 sm:p-7 text-left rounded-2xl border bg-gradient-to-br ${t.accent} bg-card/90 backdrop-blur-sm shadow-lg shadow-black/5 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 touch-manipulation min-h-[220px]`}
                >
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${t.iconWrap} group-hover:scale-105 transition-transform`}>
                    <t.icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-black uppercase tracking-widest text-foreground">
                      {t.title}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t.desc}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                      {t.help}
                    </p>
                  </div>
                  <div className="w-full flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                    <span className="text-[11px] font-black text-foreground tracking-tight">{t.fee}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
                      {t.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
            ))}
          </div>
          {err && (
            <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-4 text-center">{err}</p>
          )}
        </section>
        )}

        {/* Soft special suggestion — only while those seats actually exist */}
        {!et && specialOpen && specialCta.slug && (
          <aside className="mb-10 max-w-5xl mx-auto rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between animate-in fade-in duration-700 delay-200">
            <div className="flex items-start gap-3 text-left min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Sun className="w-5 h-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  Also available · {specialCta.title || 'Special programme'}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Want in-person centre classes? Those seats are on {specialCta.title || 'the live special programme'} — Batch B from {specialCta.onsiteFeeLabel} (online {specialCta.onlineFeeLabel}).
                </p>
              </div>
            </div>
            <Link
              href={specialCta.registerHref}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-colors"
            >
              {specialCta.button_label || 'View special programme'} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </aside>
        )}

        {et && specialOpen && specialCta.slug && (
          <p className="text-center text-[11px] text-muted-foreground mb-6 max-w-2xl mx-auto">
            Continuing with <span className="font-bold text-foreground">{ENROLLMENT_TYPES.find((t) => t.id === et)?.title}</span>.
            {' '}Changed your mind?{' '}
            <Link href={specialCta.registerHref} className="font-bold text-primary underline-offset-2 hover:underline">
              Open {specialCta.title || 'special programme'} instead
            </Link>
            .
          </p>
        )}

        {/* ─── SINGLE STRAIGHT FORM (No multi-step wizard) ─── */}
        {et && (
        <div ref={formAnchorRef} id="enrol-form" className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 sm:p-10 md:p-12 shadow-2xl shadow-black/10 border-t-4 border-t-primary scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
          
          {selectedProgramObj && (
            <div className="mb-8 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border border-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-black shrink-0 shadow-lg shadow-primary/20">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest mb-1">
                    Specialist Track Direct Enrolment
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tight">
                    {selectedProgramObj.label}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    You are completing the dedicated enrolment form for the <span className="font-bold text-foreground">{selectedProgramObj.name}</span> track.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                {ENROLLMENT_TYPES.find((t) => t.id === et)?.title} Registration
              </p>
              <h2 className="text-xl sm:text-2xl font-black text-foreground mt-1">Complete Learner Registration</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{typeFeeLabel(et)}</p>
            </div>
            <button
              type="button"
              onClick={clearPath}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 hover:bg-muted transition-colors border border-border/60"
            >
              ← Change path
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-12">
            
            {/* Dynamic Selected Programme Banner if prefilled from URL or chosen */}
            {selectedProgramObj && (
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border border-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-black text-xl shrink-0 shadow-md shadow-primary/20">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        Selected Programme
                      </span>
                    </div>
                    <h4 className="text-base sm:text-lg font-black text-foreground mt-1">
                      {selectedProgramObj.label}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enrolling for live instruction, project-based assignments, and portal access.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, courseInterest: '' }))}
                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Change programme
                  </button>
                </div>
              </div>
            )}

            {/* ─── SECTION 01: Learner Details ─── */}
            <div className="space-y-6">
              <div className="pb-3 border-b border-border/80 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">01</div>
                <h3 className="text-xs font-black text-foreground uppercase tracking-[0.25em]">Learner Details</h3>
              </div>

              <Field label="Full Name *" icon={User}>
                <input type="text" name="fullName" value={form.fullName} onChange={set} onBlur={captureOnBlur} required placeholder="Legal Full Name" className={inputCls()} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Birth Date *" icon={Calendar}>
                  <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={set} required className={inputCls() + ' cursor-pointer'} />
                </Field>
                <Field label="Gender *">
                  <select name="gender" value={form.gender} onChange={set} required className={selectCls()}>
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </Field>
              </div>

              <Field label="Grade Level / Status *">
                <select name="grade" value={form.grade} onChange={set} required className={selectCls()}>
                  <option value="">Select grade or status</option>
                  {REGISTRATION_GRADE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </Field>

              <Field label={et === 'school' ? 'Partner School *' : isAdultLearner ? 'Organisation / workplace (Optional)' : 'Origin School (Optional)'} icon={School}>
                {et === 'school' ? (
                  <select
                    name="partnerSchoolId"
                    value={form.partnerSchoolId}
                    onChange={set}
                    required
                    disabled={schoolsLoading || Boolean(schoolsError) || schools.length === 0}
                    className={selectCls(true)}
                  >
                    <option value="">
                      {schoolsLoading ? 'Loading partner schools...' : schools.length ? 'Select Partner School' : 'No partner schools available'}
                    </option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input type="text" name="currentSchool" value={form.currentSchool} onChange={set} placeholder={isAdultLearner ? 'Company or organisation (optional)' : 'Current Institution'} className={inputCls()} />
                )}
                {et === 'school' && <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />}
              </Field>

              {et === 'school' && (
                <p className={`-mt-3 ml-1 text-xs leading-relaxed ${schoolsError ? 'font-semibold text-rose-500' : 'text-muted-foreground'}`}>
                  {schoolsError || (schools.length === 0 && !schoolsLoading
                    ? 'Your school must first be added as a Rillcod partner school. Choose Online School if the learner is joining independently.'
                    : 'Choose the registered partner school from the list; no school name needs to be typed.')}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="City" icon={MapPin}>
                   <input type="text" name="city" value={form.city} onChange={set} placeholder="e.g. Benin City" className={inputCls()} />
                </Field>
                <Field label="State *">
                   <select name="state" value={form.state} onChange={set} required className={selectCls()}>
                      <option value="">Select State</option>
                      {NIGERIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                   </select>
                   <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </Field>
              </div>
            </div>

            {/* ─── SECTION 02: Contact Details ─── */}
            <div className="space-y-6 pt-4">
              <div className="pb-3 border-b border-border/80 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">02</div>
                <h3 className="text-xs font-black text-foreground uppercase tracking-[0.25em]">
                  {isAdultLearner ? 'Contact / Self Details' : 'Parent / Guardian Details'}
                </h3>
              </div>

              <Field label={isAdultLearner ? 'Full name (self or emergency contact) *' : 'Full Guardian Name *'} icon={User}>
                 <input type="text" name="parentName" value={form.parentName} onChange={set} onBlur={captureOnBlur} required placeholder="Full Legal Name" className={inputCls()} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Relationship *" icon={Heart}>
                   <select name="parentRelationship" value={form.parentRelationship} onChange={set} required className={selectCls(true)}>
                      <option value="">Select Relation</option>
                      {isAdultLearner && <option value="Self">Self (Adult / Individual)</option>}
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Guardian">Guardian</option>
                      <option value="Spouse">Spouse / Partner</option>
                      <option value="Other">Other</option>
                   </select>
                   <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </Field>

                <Field label="WhatsApp / Phone *" icon={Phone}>
                   <input type="tel" name="parentPhone" value={form.parentPhone} onChange={set} onBlur={captureOnBlur} required placeholder="+234..." className={inputCls()} />
                </Field>
              </div>

              <Field label={isAdultLearner ? 'Email Address *' : 'Parent Email Address *'} icon={Mail}>
                 <input type="email" name="parentEmail" value={form.parentEmail} onChange={set} onBlur={captureOnBlur} required placeholder="you@example.com" className={inputCls()} />
              </Field>
            </div>

            {/* ─── SECTION 03: Programme & Payment ─── */}
            <div className="space-y-6 pt-4">
              <div className="pb-3 border-b border-border/80 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">03</div>
                <h3 className="text-xs font-black text-foreground uppercase tracking-[0.25em]">Programme & Payment</h3>
              </div>

              <Field label="Programme Interest *" icon={BookOpen}>
                 <select name="courseInterest" value={form.courseInterest} onChange={set} required className={selectCls(true)}>
                    <option value="">Select Programme</option>
                    {et === 'school' && (
                      <optgroup label="School Programmes (Subsidised)">
                        {SCHOOL_PROGRAMME_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {et !== 'school' && isAdultLearner && (
                      <optgroup label="Adult / Individual tracks">
                        {SPECIALIST_PROGRAMME_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {et !== 'school' && !isAdultLearner && (
                      <optgroup label="Flagship & specialised">
                        {SCHOOL_PROGRAMME_OPTIONS.map((o) => (
                          <option key={`f-${o.value}`} value={o.value}>{o.label}</option>
                        ))}
                        {SPECIALIST_PROGRAMME_OPTIONS.filter((o) => o.value !== 'Teen Developers').map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    )}
                 </select>
                 <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </Field>

              {et === 'school' && (form.courseInterest === 'Young Innovators' || form.courseInterest === 'Teen Developers') && (
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest -mt-3 ml-1">
                  ✓ Partner school pricing — {PARTNER_SCHOOL_TERM_FEE_LABEL}
                </p>
              )}

              <Field label="Preferred Schedule *" icon={Calendar}>
                 <select name="preferredSchedule" value={form.preferredSchedule} onChange={set} required className={selectCls(true)}>
                    <option value="">Select Schedule</option>
                    {schedules.map(s => <option key={s.value} value={s.value}>{s.label} — {s.feeLabel}</option>)}
                 </select>
                 <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </Field>

              {et === 'school' && form.preferredSchedule && (
                <div className="p-5 sm:p-6 rounded-xl bg-card border border-border/80 text-left space-y-3">
                  {form.preferredSchedule === 'Termly Programme' ? (
                    <>
                      <h4 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-primary" /> Regular School Term Programme
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Partner students pay a subsidized ₦30,000. Under this regular school term track, the fee is collected primarily on behalf of the partner school for in-school instruction.
                      </p>
                    </>
                  ) : form.preferredSchedule === 'Holiday Programme' ? (
                    <>
                      <h4 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Sun className="w-4 h-4 text-amber-500" /> Partner Holiday Special Programme
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        A subsidized flat ₦30,000 holiday learning programme. Access card validation is required to qualify.
                      </p>
                    </>
                  ) : null}
                </div>
              )}

              {et === 'school' && form.preferredSchedule === 'Holiday Programme' && (
                <div className="space-y-2 mt-4 text-left">
                  <Field label="Access Card Registration Code (RC) *" icon={ShieldCheck}>
                    <input
                      type="text"
                      name="rcCode"
                      value={form.rcCode}
                      onChange={(e) => {
                        set(e);
                        setRcVerified('idle');
                        setRcError('');
                        setErr('');
                      }}
                      required
                      placeholder="e.g. RC-123456"
                      className={inputCls()}
                    />
                  </Field>
                  {rcVerified === 'verifying' && (
                    <p className="text-xs text-muted-foreground/80 flex items-center gap-1.5 mt-1 ml-1 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying RC Code...
                    </p>
                  )}
                  {rcVerified === 'valid' && (
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1 ml-1 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-500" /> ✓ Active Partner Card: {rcCardName}
                    </p>
                  )}
                  {rcVerified === 'invalid' && (
                    <p className="text-xs font-semibold text-rose-500 mt-1 ml-1">
                      ✗ {rcError || 'Invalid RC Code. Only active partner students qualify.'}
                    </p>
                  )}
                </div>
              )}

              <Field label="How did you hear about us?">
                 <select name="hearAboutUs" value={form.hearAboutUs} onChange={set} className={selectCls()}>
                    <option value="">Select option (optional)</option>
                    {REGISTRATION_HEAR_ABOUT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                 </select>
                 <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </Field>

              {et && !isNativeApp && (
                <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 space-y-4">
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Programme fee</p>
                   <p className="text-2xl sm:text-3xl font-black text-primary mt-1 tracking-tight">{feeAmount || typeFeeLabel(et)}</p>

                   <div className={`grid gap-2 ${instalmentsEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                     <button type="button" onClick={() => setPaymentPlan('full')}
                       className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${paymentPlan === 'full' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}>
                       Pay full
                     </button>
                     {instalmentsEnabled && (
                       <button type="button" onClick={() => setPaymentPlan('instalment')}
                         className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${paymentPlan === 'instalment' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}>
                         50% deposit
                       </button>
                     )}
                   </div>

                   <div className="grid grid-cols-2 gap-2">
                     <button type="button" onClick={() => setPaymentMethod('paystack')}
                       className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${paymentMethod === 'paystack' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}>
                       <CreditCard className="w-3.5 h-3.5" /> Paystack
                     </button>
                     <button type="button" onClick={() => setPaymentMethod('bank_transfer')}
                       className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${paymentMethod === 'bank_transfer' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}>
                       <Building2 className="w-3.5 h-3.5" /> Bank transfer
                     </button>
                   </div>

                   {paymentMethod === 'bank_transfer' && tuitionTotal > 0 && (
                     <div className="space-y-3 border-t border-primary/20 pt-4">
                       {bankAccounts.length > 0 && (
                         <div className="text-[10px] text-muted-foreground space-y-1">
                           {bankAccounts.map((acct, i) => (
                             <p key={i}><strong>{acct.bank_name}</strong> — {acct.account_number} ({acct.account_name})</p>
                           ))}
                         </div>
                       )}
                       <BankTransferAmountField
                         value={transferAmount}
                         onChange={setTransferAmount}
                         attempted={loading}
                         totalTuition={tuitionTotal}
                         suggestedAmount={suggestedDeposit}
                         depositPercent={50}
                         settlement={bankTransferSettlement}
                         labelCls={(err) => `text-[10px] font-black uppercase tracking-widest ${err ? 'text-rose-500' : 'text-muted-foreground'}`}
                         inputCls={(err) => `w-full px-4 py-3 bg-background border rounded-xl text-sm font-medium ${err ? 'border-rose-500' : 'border-border'}`}
                         compact
                       />
                       <div>
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Receipt or transfer reference *</label>
                         <input ref={receiptInputRef} type="file" accept={receiptAcceptAttribute()} className="hidden"
                           onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleReceiptUpload(f); e.target.value = ''; }} />
                         <div className="flex gap-2 mt-1.5">
                           <input type="text" value={paymentReference.startsWith('http') ? 'Receipt uploaded ✓' : paymentReference}
                             onChange={(e) => setPaymentReference(e.target.value)} placeholder="Reference or upload receipt"
                             className="flex-1 px-4 py-3 bg-background border border-border rounded-xl text-sm" readOnly={paymentReference.startsWith('http')} />
                           <button type="button" onClick={() => receiptInputRef.current?.click()} disabled={uploadingReceipt}
                             className="px-3 py-3 bg-muted border border-border rounded-xl">
                             {uploadingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                           </button>
                         </div>
                       </div>
                     </div>
                   )}

                   {paymentPlan === 'instalment' && (
                     <p className="text-[10px] text-muted-foreground">
                       Pay the remaining balance later at{' '}
                       <Link href={TERM_BALANCE_PATH} className="text-primary font-bold hover:underline">student-registration/pay-balance</Link>.
                     </p>
                   )}
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                     {paymentMethod === 'bank_transfer' ? 'Submit proof for staff verification' : 'Secure checkout via Paystack'}
                   </p>
                </div>
              )}

              <div className="flex items-start gap-4 p-5 sm:p-6 bg-muted/30 border border-border rounded-xl">
                 <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-5 h-5 accent-primary cursor-pointer flex-shrink-0" />
                 <label htmlFor="terms" className="text-[11px] font-bold text-muted-foreground leading-relaxed cursor-pointer">
                            I confirm all details provided are accurate and agree to the <Link href="/terms-of-service" className="text-primary underline underline-offset-2">Terms & Conditions</Link>.
                 </label>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-6 border-t border-border space-y-4">
              {err && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  {err}
                </div>
              )}

              {existingLearnerNext && (
                <Link href={existingLearnerNext} className="flex min-h-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 px-5 py-3 text-xs font-black text-primary hover:bg-primary/10">
                  Continue with the existing learner record
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <button 
                  type="button" 
                  onClick={clearPath}
                  className="flex items-center gap-2 min-h-11 px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
                >
                   <ArrowLeft className="w-4 h-4 shrink-0" />
                   Change path
                </button>
                
                <button 
                  type="submit" 
                  disabled={loading || uploadingReceipt || (!isNativeApp && paymentMethod === 'bank_transfer' && !bankTransferReady) || (et === 'school' && (schoolsLoading || Boolean(schoolsError) || schools.length === 0))} 
                  className="w-full sm:w-auto group flex items-center justify-center gap-3 px-10 py-5 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/25 disabled:opacity-50 border-b-2 border-b-brand-red-600/50"
                >
                   {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing enrolment...</>
                   ) : (
                      <>{isNativeApp ? 'Submit Enrolment' : paymentMethod === 'bank_transfer' ? 'Submit Registration' : 'Proceed to Payment'} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                   )}
                </button>
              </div>
            </div>
          </form>
        </div>
        )}
    </div>
  );
}
