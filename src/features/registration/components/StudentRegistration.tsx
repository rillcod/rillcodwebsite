'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Check, ArrowRight, ArrowLeft, Loader2,
  Phone, Mail, School, BookOpen, Calendar, ChevronDown, MapPin,
  Heart, Globe, Sun, Building2, ShieldCheck,
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
  TERM_ENROLLMENT_TYPES,
  type TermEnrollmentType,
} from '@/lib/registration/enrollment-types';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import { consumeStudentPrefill } from '@/lib/whatsapp/mini-intake';
import {
  ONLINE_SCHEDULES,
  SCHOOL_SCHEDULES,
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

// ─── Steps ────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Learner Info', icon: User },
  { label: 'Contact', icon: Phone },
  { label: 'Programme', icon: BookOpen },
];

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

// ─── Shared helpers ────────────────────────────────────────────────
function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none z-10" />}
        {children}
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
  fullName: '', dateOfBirth: '', grade: '', currentSchool: '', gender: '',
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
  const { cta: specialCta, loaded: specialLoaded } = useFeaturedSpecialProgram();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [autoOnboarded, setAutoOnboarded] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [rcVerified, setRcVerified] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
  const [rcCardName, setRcCardName] = useState('');
  const [rcError, setRcError] = useState('');

  const selectPath = (id: TermEnrollmentType) => {
    setForm((p) => ({ ...p, enrollmentType: id, preferredSchedule: '', courseInterest: '', rcCode: '' }));
    setRcVerified('idle');
    setRcCardName('');
    setRcError('');
    setStep(0);
    setErr('');
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('type', id);
    router.replace(`${STUDENT_REGISTRATION_PATH}?${params.toString()}`, { scroll: false });
    // Jump straight to the form after paint
    requestAnimationFrame(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const clearPath = () => {
    setForm((p) => ({ ...p, enrollmentType: '', preferredSchedule: '', courseInterest: '', rcCode: '' }));
    setRcVerified('idle');
    setRcCardName('');
    setRcError('');
    setStep(0);
    setErr('');
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('type');
    const qs = params.toString();
    router.replace(qs ? `${STUDENT_REGISTRATION_PATH}?${qs}` : STUDENT_REGISTRATION_PATH, { scroll: false });
  };

  useEffect(() => {
    createClient()
      .from('schools')
      .select('id, name')
      .eq('status', 'approved')
      .order('name')
      .then(({ data }: any) => setSchools(data ?? []));
  }, []);

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
    // Legacy ?type=special|bootcamp|in_person → featured Summer / special form
    if (!specialLoaded || !specialCta.registerHref) return;
    const t = searchParams?.get('type');
    if (!isSpecialTypeParam(t) && !isInPersonTypeParam(t)) return;
    window.location.replace(specialCta.registerHref);
  }, [specialLoaded, specialCta.registerHref, searchParams]);

  useEffect(() => {
    const urlType = parseTermEnrollmentTypeParam(searchParams?.get('type'));
    const propType = parseTermEnrollmentTypeParam(defaultEnrollmentType);
    const nextType = (propType || urlType || '') as EnrollmentType;
    if (nextType && form.enrollmentType !== nextType) {
      setForm(p => ({ ...p, enrollmentType: nextType, preferredSchedule: '' }));
    }
  }, [defaultEnrollmentType, searchParams, form.enrollmentType]);

  // Deep-link ?type=online|school → land on the form, not the chooser
  // (?type=in_person / special redirect above)
  useEffect(() => {
    if (!form.enrollmentType) return;
    const t = window.setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [form.enrollmentType]);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    // Reset preferredSchedule when courseInterest changes for school type (price tiers differ)
    if (name === 'courseInterest' && form.enrollmentType === 'school') {
      setForm(p => ({ ...p, courseInterest: value, preferredSchedule: '' }));
    } else {
      setForm(p => ({ ...p, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
    }
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.enrollmentType) { setErr('Please specify enrollment path.'); return; }
    setErr('');
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const back = () => { setStep(s => Math.max(0, s - 1)); setErr(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.termsAgreement) { setErr('Please accept the terms to continue.'); return; }
    setLoading(true); setErr('');
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
          const res = await fetch(`/api/cards/verify-public?code=${encodeURIComponent(form.rcCode.trim())}`);
          const data = await res.json();
          if (res.ok && data.valid && data.result === 'ok') {
            setRcVerified('valid');
            setRcCardName(data.card.holder_name || 'Active Partner Student');
          } else {
            setRcVerified('invalid');
            const errorMsg = data.error || 'Invalid or inactive Registration Code (RC). Only active partner students qualify for the subsidy.';
            setRcError(errorMsg);
            setErr(errorMsg);
            setLoading(false);
            return;
          }
        } catch (err) {
          setRcVerified('invalid');
          setRcError('Failed to verify Registration Code. Please try again.');
          setErr('Failed to verify Registration Code. Please try again.');
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
      const res = await fetch('/api/payments/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_type: form.enrollmentType,
          full_name: form.fullName,
          date_of_birth: form.dateOfBirth || null,
          gender: form.gender.toLowerCase(),
          grade_level: form.grade,
          school_name: form.currentSchool || null,
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
          ...(programId ? { program_id: programId } : {}),
          return_path: STUDENT_REGISTRATION_PATH,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed. Please try again.');
      if (isNativeApp) {
        setSubmitted(true);
        setLoading(false);
      } else {
        window.location.href = data.paymentUrl;
      }
    } catch (e: any) {
      setErr(e.message ?? 'Submission failed.');
      setLoading(false);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isCap = !!(window as any).Capacitor || window.location.search.includes('platform=') || navigator.userAgent.toLowerCase().includes('rillcod-app');
      setIsNativeApp(isCap);
    }
  }, []);

  useEffect(() => {
    if (paymentStatus !== 'success' || !paymentRef) return;
    let cancelled = false;

    setVerifyingPayment(true);
    setPaymentError('');
    fetch(`/api/payments/registration/verify?reference=${encodeURIComponent(paymentRef)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Payment could not be verified.');
        }
        if (!cancelled) {
          setPaymentVerified(true);
          setAutoOnboarded(!!data.autoOnboarded);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setPaymentError(e.message || 'Payment verification failed.');
      })
      .finally(() => {
        if (!cancelled) setVerifyingPayment(false);
      });

    return () => { cancelled = true; };
  }, [paymentStatus, paymentRef]);

  if (submitted) {
    return (
      <div className="bg-card border border-border p-12 text-center shadow-2xl rounded-none border-t-4 border-t-emerald-500 max-w-md mx-auto">
        <Check className="w-14 h-14 mx-auto text-emerald-500 mb-6 bg-emerald-500/10 p-3 rounded-full" />
        <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Registration Submitted!</h2>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          Your learner registration has been successfully received.
        </p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          An invoice with secure checkout and payment options has been sent to <strong className="text-foreground">{form.parentEmail}</strong>. Please complete the payment from your email to activate the account.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login" className="w-full py-3.5 bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary/95 transition-all text-center">
            Go to Login
          </Link>
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
               {specialCta.slug ? (
                 <a href={specialCta.registerHref} className="px-4 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest text-center">
                   {RETENTION_PITCH.ctaSpecial}
                 </a>
               ) : null}
               <a href="/programs" className="px-4 py-3 border border-border text-[10px] font-black uppercase tracking-widest text-center hover:bg-muted">
                 Explore programmes
               </a>
             </div>
           </div>
         )}
         {paymentRef ? (
           <p className="text-[11px] font-mono text-muted-foreground/80 mb-8 break-all">Payment reference: <span className="text-foreground">{paymentRef}</span></p>
         ) : null}
         <button onClick={() => window.location.href = '/'} className="px-10 py-5 bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-emerald-600 transition-all">Return to Home</button>
      </div>
    );
  }

  const isAdultLearner = form.grade === 'Adult' || form.grade === 'Individual';
  const feeAmount = selectedSchedule ? `₦${selectedSchedule.fee.toLocaleString()}` : '';

  return (
    <div className="w-full relative py-4 sm:py-8">
        {/* Exit control — site nav is hidden on this route */}
        <div className="sticky top-0 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 mb-6 sm:mb-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 py-3 bg-background/80 backdrop-blur-xl border-b border-border/80 sm:rounded-2xl sm:border sm:px-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 min-h-11 px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              Back to home
            </Link>
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

        {/* Header — brand-led, conversion-focused */}
        {!et && (
        <header className="text-center mb-10 sm:mb-12 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-700">
          <p className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground mb-3">
            RILLCOD<span className="text-brand-red-600">.</span>
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground leading-[1.05] tracking-tight uppercase mb-4">
            Enrol a <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-brand-red-600">learner</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto font-medium leading-relaxed">
            Pick how you will attend — then complete a short form. Secure Paystack checkout. Portal access after confirmation.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {['Secure payment', 'Kids → adults', 'Term-on-term portal'].map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/80 bg-card/70 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                {chip}
              </span>
            ))}
          </div>
        </header>
        )}

        {/* Term path chooser — only when no path selected yet */}
        {!et && (
        <section className="mb-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.35em] mb-5 text-center">
            How will you attend?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
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

        {/* Soft special / summer suggestion */}
        {!et && specialLoaded && specialCta.slug && (
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

        {et && specialLoaded && specialCta.slug && (
          <p className="text-center text-[11px] text-muted-foreground mb-6 max-w-2xl mx-auto">
            Continuing with <span className="font-bold text-foreground">{ENROLLMENT_TYPES.find((t) => t.id === et)?.title}</span>.
            {' '}Changed your mind?{' '}
            <Link href={specialCta.registerHref} className="font-bold text-primary underline-offset-2 hover:underline">
              Open {specialCta.title || 'special programme'} instead
            </Link>
            .
          </p>
        )}

        {/* Term form */}
        {et && (
        <div ref={formAnchorRef} id="enrol-form" className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 sm:p-10 md:p-12 shadow-2xl shadow-black/10 border-t-4 border-t-primary scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                {ENROLLMENT_TYPES.find((t) => t.id === et)?.title}
              </p>
              <p className="text-sm font-bold text-foreground mt-1">Almost there — complete enrolment</p>
              <p className="text-xs text-muted-foreground mt-0.5">{typeFeeLabel(et)}</p>
            </div>
            <button
              type="button"
              onClick={clearPath}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 hover:bg-muted transition-colors"
            >
              ← Change path
            </button>
          </div>
          {/* Progress Strip */}
          <div className="flex items-center justify-between mb-10 gap-2">
             {STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                   <div className={`w-9 h-9 shrink-0 flex items-center justify-center text-[10px] font-black rounded-xl border transition-colors ${i <= step ? 'bg-primary border-primary text-white shadow-md shadow-primary/25' : 'border-border text-muted-foreground/40 bg-muted/30'}`}>
                      {i < step ? <Check className="w-4 h-4" /> : i + 1}
                   </div>
                   <span className={`text-[9px] font-black uppercase tracking-widest truncate hidden sm:block ${i <= step ? 'text-foreground' : 'text-muted-foreground/40'}`}>{s.label}</span>
                   {i < STEPS.length - 1 && <div className={`hidden sm:block h-px flex-1 mx-1 ${i < step ? 'bg-primary/50' : 'bg-border'}`} />}
                </div>
             ))}
          </div>

          <form onSubmit={step < STEPS.length - 1 ? next : handleSubmit} className="space-y-8 min-h-[360px]">
              
              {step === 0 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 pb-4 border-b border-border">01 — Learner Details</h3>
                  <Field label="Full Name *" icon={User}>
                    <input type="text" name="fullName" value={form.fullName} onChange={set} required placeholder="Legal Name" className={inputCls()} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
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
                      <select name="currentSchool" value={form.currentSchool} onChange={set} required className={selectCls(true)}>
                        <option value="">Select Partner School</option>
                        {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    ) : (
                      <input type="text" name="currentSchool" value={form.currentSchool} onChange={set} placeholder={isAdultLearner ? 'Company or organisation (optional)' : 'Current Institution'} className={inputCls()} />
                    )}
                    {et === 'school' && <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />}
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
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
              )}

              {step === 1 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                   <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 pb-4 border-b border-border">
                     02 — {isAdultLearner ? 'Contact / Self Details' : 'Parent / Guardian Details'}
                   </h3>
                   <Field label={isAdultLearner ? 'Full name (self or emergency contact) *' : 'Full Guardian Name *'} icon={User}>
                      <input type="text" name="parentName" value={form.parentName} onChange={set} required placeholder="Full Legal Name" className={inputCls()} />
                   </Field>
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
                      <input type="tel" name="parentPhone" value={form.parentPhone} onChange={set} required placeholder="+234..." className={inputCls()} />
                   </Field>
                   <Field label={isAdultLearner ? 'Email Address *' : 'Parent Email Address *'} icon={Mail}>
                      <input type="email" name="parentEmail" value={form.parentEmail} onChange={set} required placeholder="you@example.com" className={inputCls()} />
                   </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                   <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 pb-4 border-b border-border">03 — Programme & Payment</h3>
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
                         <optgroup label="Seasonal / AI cohort">
                           <option value="Special Programme (see banner)">Open featured special programme instead</option>
                         </optgroup>
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                   </Field>
                   {et === 'school' && (form.courseInterest === 'Young Innovators' || form.courseInterest === 'Teen Developers') && (
                     <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1 ml-1">
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
                              Partner students pay a subsidized ₦30,000. Under this regular school term track, the fee is collected primarily on behalf of the partner school for in-school instruction, and the school receives its agreed settlement.
                            </p>
                            <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic bg-muted/30 p-3 rounded-lg border border-border/40">
                              Any remaining amount represents your subscription to the Rillcod digital platform and premium support, covering one-on-one academic follow-up, personalized tutoring and mentoring, digital assignments, access to STEM learning resources, and continuous offline help.
                            </p>
                          </>
                        ) : form.preferredSchedule === 'Holiday Programme' ? (
                          <>
                            <h4 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Sun className="w-4 h-4 text-amber-500" /> Partner Holiday Special Programme
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              A subsidized flat ₦30,000 holiday learning programme. This is a special seasonal vacation cohort, completely separate from the school's regular academic session and normal term classes.
                            </p>
                            <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic bg-muted/30 p-3 rounded-lg border border-border/40">
                              Access card validation is required to qualify for this subsidized partner holiday track. All holiday enrolments, payments, and progress reports are tracked independently.
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

                   {et && (
                     <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Programme fee</p>
                        <p className="text-2xl sm:text-3xl font-black text-primary mt-1 tracking-tight">{feeAmount || typeFeeLabel(et)}</p>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Secure checkout via Paystack</p>
                     </div>
                   )}

                   <div className="flex items-start gap-4 p-5 sm:p-6 bg-muted/30 border border-border rounded-xl">
                      <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-5 h-5 accent-primary cursor-pointer flex-shrink-0" />
                      <label htmlFor="terms" className="text-[11px] font-bold text-muted-foreground leading-relaxed cursor-pointer">
                                 I confirm all details provided are accurate and agree to the <Link href="/terms-of-service" className="text-primary underline underline-offset-2">Terms & Conditions</Link>.
                      </label>
                   </div>
                   {err && <p className="text-rose-500 text-xs font-black uppercase tracking-widest">{err}</p>}
                </div>
              )}

              {/* Control Strip */}
              <div className="flex justify-between items-center pt-8 border-t border-border gap-3">
                <button 
                  type="button" 
                  onClick={
                    step === 0
                      ? clearPath
                      : back
                  }
                  className="flex items-center gap-2 sm:gap-3 min-h-11 px-4 sm:px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors touch-manipulation rounded-xl hover:bg-muted"
                >
                   <ArrowLeft className="w-4 h-4 shrink-0" />
                   {step === 0 ? 'Change path' : 'Back'}
                </button>
                <button type="submit" disabled={loading} className="group flex items-center gap-3 px-8 sm:px-12 py-4 sm:py-5 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/25 disabled:opacity-50 border-b-2 border-b-brand-red-600/50">
                   {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                   ) : step < STEPS.length - 1 ? (
                      <>Next Step <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                   ) : (
                      <>Proceed to Payment <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                   )}
                </button>
              </div>
          </form>
        </div>
        )}
    </div>
  );
}
