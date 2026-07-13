'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  User, Check, ArrowRight, ArrowLeft, Loader2, GraduationCap,
  Phone, Mail, School, BookOpen, Calendar, ChevronDown, MapPin,
  Heart, Globe, Sun, Building2, Home, Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import {
  SCHOOL_PROGRAMME_OPTIONS,
  SPECIALIST_PROGRAMME_OPTIONS,
  REGISTRATION_TRUST_POINTS,
  RETENTION_PITCH,
  REGISTRATION_GRADE_OPTIONS,
  REGISTRATION_HEAR_ABOUT_OPTIONS,
} from '@/lib/registration/programme-map';
import { usePathname } from 'next/navigation';

// ─── Enrollment types ─────────────────────────────────────────────
// "bootcamp" = special/seasonal cohort — routed into special_program_pages (not a separate lost path)
const ENROLLMENT_TYPES = [
  {
    id: 'school',
    icon: Building2,
    title: 'Partner School',
    desc: 'My child attends a school partnered with Rillcod Technologies',
    color: 'border-blue-500 bg-blue-500/10',
    dot: 'bg-blue-400',
  },
  {
    id: 'bootcamp',
    icon: Sun,
    title: 'Special Programme',
    desc: 'Featured AI / seasonal cohort — live page, correct fees & auto onboarding',
    color: 'border-primary bg-primary/10',
    dot: 'bg-primary',
  },
  {
    id: 'online',
    icon: Globe,
    title: 'Online School',
    desc: 'Fully online digital school — kids, teens, adults & individuals',
    color: 'border-emerald-500 bg-emerald-500/10',
    dot: 'bg-emerald-400',
  },
  {
    id: 'in_person',
    icon: MapPin,
    title: 'In-Person',
    desc: 'Direct enrolment at our centre — kids, teens, adults & individuals',
    color: 'border-violet-500 bg-violet-500/10',
    dot: 'bg-violet-400',
  },
] as const;

type EnrollmentType = 'school' | 'bootcamp' | 'online' | 'in_person' | '';

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
  `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-6 py-5 bg-background border border-border rounded-none text-sm font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all`;

const selectCls = (hasIcon = false) =>
  `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-10 py-5 bg-background border border-border rounded-none text-sm font-bold text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer`;

// ─── Default form state ────────────────────────────────────────────
const defaultForm = {
  enrollmentType: '' as EnrollmentType,
  fullName: '', dateOfBirth: '', grade: '', currentSchool: '', gender: '',
  city: '', state: '', studentEmail: '',
  parentName: '', parentPhone: '', parentEmail: '', parentRelationship: '',
  courseInterest: '', preferredSchedule: '', hearAboutUs: '',
  termsAgreement: false,
};

// ─── Schedule options per type ────────────────────────────────────
// Partner school: Young Innovators (ages 6–12) — subsidised via school arrangement
const SCHOOL_YOUNG_INNOVATORS: { value: string; label: string; fee: number; feeLabel: string }[] = [
  { value: 'Weekday Afternoons',  label: 'Weekday Afternoons (at school)',     fee: 20000, feeLabel: '₦20,000 / term' },
  { value: 'Weekend In-Person',   label: 'Weekend In-Person Sessions',         fee: 20000, feeLabel: '₦20,000 / term' },
  { value: 'Termly Programme',    label: 'Full Termly Programme',              fee: 20000, feeLabel: '₦20,000 / term' },
  { value: 'Holiday Programme',   label: 'Holiday / Vacation Programme',       fee: 20000, feeLabel: '₦20,000 / holiday' },
];

// Partner school: Teen Developers (ages 12–18) — subsidised
const SCHOOL_TEEN_DEVELOPERS: { value: string; label: string; fee: number; feeLabel: string }[] = [
  { value: 'Weekday Afternoons',  label: 'Weekday Afternoons (at school)',     fee: 20000, feeLabel: '₦20,000 / term' },
  { value: 'Weekend In-Person',   label: 'Weekend In-Person Sessions',         fee: 20000, feeLabel: '₦20,000 / term' },
  { value: 'Termly Programme',    label: 'Full Termly Programme',              fee: 20000, feeLabel: '₦20,000 / term' },
  { value: 'Holiday Programme',   label: 'Holiday / Vacation Programme',       fee: 20000, feeLabel: '₦20,000 / holiday' },
];

// Helper: get school schedule options based on programme
function getSchoolSchedules(courseInterest: string) {
  const lower = (courseInterest || '').toLowerCase();
  if (lower.includes('young innovator') || lower.includes('young_innovator')) return SCHOOL_YOUNG_INNOVATORS;
  if (lower.includes('teen developer') || lower.includes('teen_developer')) return SCHOOL_TEEN_DEVELOPERS;
  // All other school programmes (Python, Web, AI, Robotics, etc.)
  return [
    { value: 'Weekday Afternoons',  label: 'Weekday Afternoons (at school)',   fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Weekend In-Person',   label: 'Weekend In-Person Sessions',       fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Termly Programme',    label: 'Full Termly Programme',            fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Holiday Programme',   label: 'Holiday / Vacation Programme',     fee: 20000, feeLabel: '₦20,000 / holiday' },
  ];
}

const SCHEDULES: Record<string, { value: string; label: string; fee: number; feeLabel: string }[]> = {
  bootcamp: [
    { value: 'Summer School',    label: 'Summer School (Mon–Fri, 9am–2pm)',  fee: 50000, feeLabel: '₦50,000' },
    { value: 'Weekend Bootcamp', label: 'Weekend Bootcamp (Sat & Sun)',       fee: 35000, feeLabel: '₦35,000' },
    { value: 'Holiday Programme',label: 'Holiday / Vacation Programme',       fee: 30000, feeLabel: '₦30,000' },
  ],
  online: [
    { value: 'Online Live Classes', label: 'Online Live Classes (scheduled sessions)', fee: 40000, feeLabel: '₦40,000 / term' },
    { value: 'Online Self-Paced',   label: 'Online – Self-Paced (learn at your pace)', fee: 30000, feeLabel: '₦30,000 / term' },
    { value: 'Online Weekend',      label: 'Online – Weekends Only',                   fee: 25000, feeLabel: '₦25,000 / term' },
  ],
  in_person: [
    { value: 'In-Person (Weekdays)',  label: 'Weekdays – Tue & Thu (10am–1pm)',    fee: 50000, feeLabel: '₦50,000 / term' },
    { value: 'In-Person (Weekends)',  label: 'Weekends – Sat & Sun (9am–12pm)',    fee: 50000, feeLabel: '₦50,000 / term' },
    { value: 'In-Person (Evening)',   label: 'Evenings – Mon & Wed (4pm–7pm)',     fee: 50000, feeLabel: '₦50,000 / term' },
  ],
  '': [
    { value: 'Weekday Afternoons', label: 'Weekday Afternoons (at school)',  fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Weekend In-Person',  label: 'Weekend In-Person Sessions',      fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Termly Programme',   label: 'Full Termly Programme',           fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Holiday Programme',  label: 'Holiday / Vacation Programme',    fee: 20000, feeLabel: '₦20,000 / holiday' },
  ],
};

const TYPE_FEES: Record<string, string> = {
  school:    '₦20,000 / term',
  bootcamp:  '₦30,000 – ₦50,000',
  online:    '₦25,000 – ₦40,000 / term',
  in_person: '₦50,000 / term',
  '':        '',
};

// ─── Main component ───────────────────────────────────────────────
export function StudentRegistration({ defaultEnrollmentType }: { defaultEnrollmentType?: EnrollmentType }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { cta: specialCta, loaded: specialLoaded } = useFeaturedSpecialProgram();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    createClient()
      .from('schools')
      .select('id, name')
      .eq('status', 'approved')
      .order('name')
      .then(({ data }: any) => setSchools(data ?? []));
  }, []);

  useEffect(() => {
    const urlTypeRaw = searchParams?.get('type') || '';
    const urlType = (urlTypeRaw === 'special' ? 'bootcamp' : urlTypeRaw) as EnrollmentType;
    const nextType = (defaultEnrollmentType || urlType || '') as EnrollmentType;
    if (nextType && form.enrollmentType !== nextType) {
      setForm(p => ({ ...p, enrollmentType: nextType, preferredSchedule: '' }));
    }
  }, [defaultEnrollmentType, searchParams, form.enrollmentType]);

  useEffect(() => {
    if (form.courseInterest === 'Special Programme (see banner)') {
      setForm((p) => ({ ...p, enrollmentType: 'bootcamp', courseInterest: '', preferredSchedule: '' }));
      setStep(0);
    }
  }, [form.courseInterest]);

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
          ...(programId ? { program_id: programId } : {}),
          return_path: pathname === '/online-registration' ? '/online-registration' : '/student-registration',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed. Please try again.');
      window.location.href = data.paymentUrl;
    } catch (e: any) {
      setErr(e.message ?? 'Submission failed.');
      setLoading(false);
    }
  };

  const paymentStatus = searchParams?.get('payment');
  const paymentRef = searchParams?.get('reference');
  const et = form.enrollmentType;
  const schedules = useMemo(() => {
    if (et === 'school') {
      return [
        { value: 'Weekday Afternoons',  label: 'Weekday Afternoons (at school)',   fee: 20000, feeLabel: '₦20,000 / term' },
        { value: 'Weekend In-Person',   label: 'Weekend In-Person Sessions',       fee: 20000, feeLabel: '₦20,000 / term' },
        { value: 'Termly Programme',    label: 'Full Termly Programme',            fee: 20000, feeLabel: '₦20,000 / term' },
        { value: 'Holiday Programme',   label: 'Holiday / Vacation Programme',     fee: 20000, feeLabel: '₦20,000 / holiday' },
      ];
    }
    if (et === 'online') {
      return [
        { value: 'Online Live Classes', label: 'Online Live Classes (scheduled sessions)', fee: 40000, feeLabel: '₦40,000 / term' },
        { value: 'Online Self-Paced',   label: 'Online – Self-Paced (learn at your pace)', fee: 30000, feeLabel: '₦30,000 / term' },
        { value: 'Online Weekend',      label: 'Online – Weekends Only',                   fee: 25000, feeLabel: '₦25,000 / term' },
      ];
    }
    if (et === 'bootcamp') {
      return [
        { value: 'Summer School',    label: 'Summer School (Mon–Fri, 9am–2pm)',  fee: 50000, feeLabel: '₦50,000' },
        { value: 'Weekend Bootcamp', label: 'Weekend Bootcamp (Sat & Sun)',       fee: 35000, feeLabel: '₦35,000' },
        { value: 'Holiday Programme',label: 'Holiday / Vacation Programme',       fee: 30000, feeLabel: '₦30,000' },
      ];
    }
    return SCHEDULES[et] ?? SCHEDULES[''];
  }, [et]);
  const selectedSchedule = schedules.find(s => s.value === form.preferredSchedule);

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
        if (!cancelled) setPaymentVerified(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setPaymentError(e.message || 'Payment verification failed.');
      })
      .finally(() => {
        if (!cancelled) setVerifyingPayment(false);
      });

    return () => { cancelled = true; };
  }, [paymentStatus, paymentRef]);

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
               ? 'Payment confirmed. Our team will activate portal access shortly — then you keep learning term after term in the same Rillcod system.'
               : paymentError || 'We could not verify this payment yet. Please contact support if you were charged.'}
         </p>
         {paymentVerified && (
           <div className="mb-8 max-w-lg mx-auto border border-primary/20 bg-primary/5 p-5 text-left">
             <p className="text-[10px] font-black uppercase tracking-widest text-primary">{RETENTION_PITCH.heading}</p>
             <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{RETENTION_PITCH.body}</p>
             <div className="flex flex-col sm:flex-row gap-2 mt-4">
               {specialCta.slug ? (
                 <a href={`${specialCta.href}#register`} className="px-4 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest text-center">
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
  const feeLabel = selectedSchedule?.feeLabel ?? TYPE_FEES[et] ?? '';
  const feeAmount = selectedSchedule ? `₦${selectedSchedule.fee.toLocaleString()}` : '';

  return (
    <div className="w-full relative py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-none text-primary text-[10px] font-black uppercase tracking-widest mb-6">
            <GraduationCap className="w-4 h-4" /> Learner Enrolment
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-foreground leading-none tracking-tight uppercase mb-4">
             REGISTER <br />
             <span className="text-foreground/40 italic">LEARNER.</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto font-medium">
            Kids, teens, adults, and individual learners — one Rillcod path from special cohorts to term classes. Simple signup. Real progress. Stay and grow.
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto text-left">
            {REGISTRATION_TRUST_POINTS.map((p) => (
              <div key={p.title} className="border border-border bg-card/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Featured special programme plug-in (never a separate lost path) */}
        {specialLoaded && specialCta.slug && (
          <div className="mb-10 max-w-3xl mx-auto border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-start gap-3 text-left">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Active special programme</p>
                <p className="text-sm font-black text-foreground mt-1">{specialCta.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {specialCta.banner || 'Register on the live programme page for correct fees, curriculum, and automatic onboarding.'}
                </p>
              </div>
            </div>
            <Link
              href={`${specialCta.href}#register`}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90"
            >
              {specialCta.button_label || 'Open special programme'} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Enrollment Path Selector */}
        <div className="mb-10">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-4 text-center">Select Enrolment Type</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {ENROLLMENT_TYPES.map(t => {
              const active = et === t.id;
              return (
                <button
                  key={t.id} type="button"
                  onClick={() => { setForm(p => ({ ...p, enrollmentType: t.id, preferredSchedule: '' })); setErr(''); setStep(0); }}
                  className={`group flex flex-col items-center gap-4 p-8 border rounded-none transition-all ${
                    active
                      ? t.color + ' shadow-2xl scale-[1.02]'
                      : 'border-border bg-card hover:bg-muted hover:border-border shadow-sm'
                  }`}>
                  <div className={`w-12 h-12 flex items-center justify-center rounded-none border ${
                    active ? 'bg-white/20 border-white/30' : 'bg-background border-border'
                  }`}>
                    <t.icon className={`w-6 h-6 ${active ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-muted-foreground'}`}>{t.title}</p>
                </button>
              );
            })}
          </div>
          {!et && err && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-4 text-center">{err}</p>}
        </div>

        {/* Special programme handoff — plugs into special_program_pages system */}
        {et === 'bootcamp' && (
          <div className="bg-card border border-border rounded-none p-8 md:p-12 shadow-2xl border-t-4 border-t-primary space-y-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
              <Sun className="w-3.5 h-3.5" /> Special programme registration
            </div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
              {specialCta.title || 'Featured special programme'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Seasonal and AI cohorts run through our Special Programmes system — same public page as the homepage button —
              with live curriculum, pricing, Paystack/bank payment, and portal onboarding. Kids, teens, adults, and individuals are welcome.
              This keeps your registration connected (not a separate dead end).
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                href={`${specialCta.href}#register`}
                className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90"
              >
                Continue to {specialCta.button_label || 'special programme'} <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, enrollmentType: 'online' }))}
                className="inline-flex items-center justify-center gap-2 px-8 py-5 border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted"
              >
                Prefer term online school instead
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Looking for Young Innovators / Teen Developers term classes? Choose Partner School, Online, or In-Person above.
            </p>
          </div>
        )}

        {/* Form Matrix — term / school / online / in-person only */}
        {et && et !== 'bootcamp' && (
        <div className="bg-card border border-border rounded-none p-8 md:p-12 shadow-2xl border-t-4 border-t-primary">
          
          {/* Progress Strip */}
          <div className="flex items-center justify-between mb-12 border-b border-border pb-8">
             {STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                   <div className={`w-8 h-8 flex items-center justify-center text-[10px] font-black rounded-none border ${i <= step ? 'bg-primary border-primary text-white' : 'border-border text-muted-foreground/30'}`}>
                      {i < step ? <Check className="w-4 h-4" /> : i + 1}
                   </div>
                   <span className={`text-[9px] font-black uppercase tracking-widest hidden sm:block ${i <= step ? 'text-foreground' : 'text-muted-foreground/30'}`}>{s.label}</span>
                </div>
             ))}
          </div>

          <form onSubmit={step < STEPS.length - 1 ? next : handleSubmit} className="space-y-8 min-h-[400px]">
              
              {step === 0 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-8 pb-4 border-b border-border">01 — Learner Details</h3>
                  <Field label="Full Name *" icon={User}>
                    <input type="text" name="fullName" value={form.fullName} onChange={set} required placeholder="Legal Name" className={inputCls()} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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
                   <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-8 pb-4 border-b border-border">
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
                   <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-8 pb-4 border-b border-border">03 — Programme & Payment</h3>
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
                       ✓ Partner school pricing applies — reduced fees
                     </p>
                   )}

                   <Field label="Preferred Schedule *" icon={Calendar}>
                      <select name="preferredSchedule" value={form.preferredSchedule} onChange={set} required className={selectCls(true)}>
                         <option value="">Select Schedule</option>
                         {schedules.map(s => <option key={s.value} value={s.value}>{s.label} — {s.feeLabel}</option>)}
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                   </Field>

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
                     <div className="p-8 bg-primary/5 border border-border rounded-none italic text-xs font-bold text-muted-foreground leading-relaxed">
                        Programme Fee: <span className="text-primary text-lg font-black not-italic ml-2">{feeAmount || TYPE_FEES[et]}</span>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">Payment processed securely via Paystack.</p>
                     </div>
                   )}

                   <div className="flex items-start gap-4 p-6 bg-muted/20 border border-border rounded-none shadow-inner">
                      <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-5 h-5 accent-primary cursor-pointer flex-shrink-0" />
                      <label htmlFor="terms" className="text-[11px] font-bold text-muted-foreground leading-relaxed cursor-pointer">
                                 I confirm all details provided are accurate and agree to the <span className="text-primary underline">Terms & Conditions</span>.
                      </label>
                   </div>
                   {err && <p className="text-rose-500 text-xs font-black uppercase tracking-widest">{err}</p>}
                </div>
              )}

              {/* Control Strip */}
              <div className="flex justify-between items-center pt-8 border-t border-border">
                <button 
                  type="button" 
                  onClick={step === 0 ? () => window.location.href = '/' : back} 
                  className="flex items-center gap-3 px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                   {step === 0 ? <Home className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                   {step === 0 ? 'Home' : 'Back'}
                </button>
                <button type="submit" disabled={loading} className="group flex items-center gap-4 px-12 py-5 bg-primary text-white text-[10px] font-black uppercase tracking-[0.4em] rounded-none hover:bg-primary transition-all shadow-xl shadow-primary/20 disabled:opacity-50">
                   {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                   ) : step < STEPS.length - 1 ? (
                      <>Next Step <ArrowRight className="w-4 h-4 group-hover:translate-x-1" /></>
                   ) : (
                      <>Proceed to Payment <ArrowRight className="w-4 h-4 group-hover:translate-x-1" /></>
                   )}
                </button>
              </div>
          </form>
        </div>
        )}
    </div>
  );
}
