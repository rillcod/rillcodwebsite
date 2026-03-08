'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  User, Check, ArrowRight, ArrowLeft, Loader2, GraduationCap,
  Phone, Mail, School, BookOpen, Calendar, ChevronDown, MapPin,
  Heart, Globe, Sun, Building2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Enrollment types ─────────────────────────────────────────────
const ENROLLMENT_TYPES = [
  {
    id: 'school',
    icon: Building2,
    title: 'Partner School',
    desc: 'My child attends a school partnered with Rillcod Academy',
    color: 'border-violet-500 bg-violet-500/10',
    dot: 'bg-violet-400',
  },
  {
    id: 'bootcamp',
    icon: Sun,
    title: 'Summer Bootcamp',
    desc: 'Intensive seasonal programme — no school affiliation required',
    color: 'border-[#FF914D] bg-[#FF914D]/10',
    dot: 'bg-[#FF914D]',
  },
  {
    id: 'online',
    icon: Globe,
    title: 'Online School',
    desc: 'Enrol in Rillcod\'s fully online, self-paced digital school',
    color: 'border-emerald-500 bg-emerald-500/10',
    dot: 'bg-emerald-400',
  },
] as const;

type EnrollmentType = 'school' | 'bootcamp' | 'online' | '';

// ─── Steps ────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Student Info', icon: User },
  { label: 'Parent / Guardian', icon: Phone },
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
    <div>
      <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none z-10" />}
        {children}
      </div>
    </div>
  );
}

const inputCls = (hasIcon = true) =>
  `w-full ${hasIcon ? 'pl-10' : 'pl-4'} pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D]/60 focus:bg-white/8 transition-all`;

const selectCls = (hasIcon = false) =>
  `w-full ${hasIcon ? 'pl-10' : 'pl-4'} pr-8 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#FF914D]/60 focus:bg-white/8 transition-all appearance-none cursor-pointer`;

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
const SCHEDULES: Record<string, { value: string; label: string; fee: number; feeLabel: string }[]> = {
  school: [
    { value: 'Weekday Afternoons',  label: 'Weekday Afternoons (at school)',  fee: 25000, feeLabel: '₦25,000 / term' },
    { value: 'Weekend In-Person',   label: 'Weekend In-Person',               fee: 20000, feeLabel: '₦20,000 / term' },
    { value: 'Termly Programme',    label: 'Termly Programme (full term)',     fee: 25000, feeLabel: '₦25,000 / term' },
    { value: 'Holiday Programme',   label: 'Holiday / Vacation Programme',    fee: 30000, feeLabel: '₦30,000 / holiday' },
  ],
  bootcamp: [
    { value: 'Summer Intensive (Day)',      label: 'Full Summer – Full Day (9am–4pm)',  fee: 60000, feeLabel: '₦60,000' },
    { value: 'Summer Intensive (Half Day)', label: 'Full Summer – Half Day (AM)',       fee: 45000, feeLabel: '₦45,000' },
    { value: 'Summer Intensive (Afternoon)',label: 'Full Summer – Half Day (PM)',       fee: 45000, feeLabel: '₦45,000' },
    { value: 'Weekend Bootcamp',            label: 'Weekend Bootcamp (Sat & Sun)',      fee: 35000, feeLabel: '₦35,000' },
    { value: 'Holiday Programme',           label: 'Holiday / Vacation Programme',     fee: 30000, feeLabel: '₦30,000' },
  ],
  online: [
    { value: 'Online Self-Paced',    label: 'Online – Self-Paced (any time)',       fee: 30000, feeLabel: '₦30,000 / term' },
    { value: 'Online Live Sessions', label: 'Online – Live Sessions (scheduled)',   fee: 40000, feeLabel: '₦40,000 / term' },
    { value: 'Online Weekend',       label: 'Online – Weekends Only',               fee: 25000, feeLabel: '₦25,000 / term' },
  ],
  '': [
    { value: 'Weekday Afternoons', label: 'Weekday Afternoons', fee: 25000, feeLabel: '₦25,000' },
    { value: 'Weekend In-Person',  label: 'Weekend Classes',    fee: 20000, feeLabel: '₦20,000' },
    { value: 'Online Self-Paced',  label: 'Online',             fee: 30000, feeLabel: '₦30,000' },
  ],
};

// Fallback fees per enrollment type (used before schedule is selected)
const TYPE_FEES: Record<string, string> = {
  school:   '₦20,000 – ₦30,000',
  bootcamp: '₦35,000 – ₦60,000',
  online:   '₦25,000 – ₦40,000',
  '':       '',
};

// ─── Main component ───────────────────────────────────────────────
type StudentRegistrationProps = {
  defaultEnrollmentType?: EnrollmentType;
};

export function StudentRegistration({ defaultEnrollmentType }: StudentRegistrationProps) {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');
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
    const urlType = searchParams?.get('type') as EnrollmentType | null;
    const nextType = defaultEnrollmentType || urlType || '';
    if (nextType && form.enrollmentType !== nextType) {
      setForm(p => ({ ...p, enrollmentType: nextType, preferredSchedule: '' }));
    }
  }, [defaultEnrollmentType, searchParams, form.enrollmentType]);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.enrollmentType) { setErr('Please select an enrollment type to continue.'); return; }
    setErr('');
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const back = () => { setStep(s => Math.max(0, s - 1)); setErr(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.termsAgreement) { setErr('Please accept the terms to continue.'); return; }
    setLoading(true); setErr('');
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
          student_email: form.studentEmail || null,
          parent_name: form.parentName,
          parent_phone: form.parentPhone,
          parent_email: form.parentEmail,
          parent_relationship: form.parentRelationship,
          course_interest: form.courseInterest,
          preferred_schedule: form.preferredSchedule,
          heard_about_us: form.hearAboutUs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      // Redirect to Paystack payment page — loading stays true (page navigates away)
      window.location.href = data.paymentUrl;
    } catch (e: any) {
      setErr(e.message ?? 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  // ── Payment callback screen (returning from Paystack) ─────────
  const paymentStatus = searchParams?.get('payment');
  const paymentName = searchParams?.get('name') ?? '';
  const paymentType = (searchParams?.get('type') ?? '') as EnrollmentType;

  if (paymentStatus === 'success') {
    const typeLabel = ENROLLMENT_TYPES.find(t => t.id === paymentType)?.title ?? 'Programme';
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white/[0.04] border border-white/10 rounded-3xl p-10 backdrop-blur-sm">
          <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="inline-block px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-xs font-bold uppercase tracking-widest mb-4">
            {typeLabel}
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-3">Payment Confirmed!</h2>
          <p className="text-white/50 text-sm leading-relaxed mb-8">
            Thank you, <strong className="text-white">{paymentName || 'Student'}</strong>! Your {typeLabel.toLowerCase()} registration and payment have been received.
            Our team will review your application and reach out within <strong className="text-white">24–48 hours</strong>.
          </p>
          <button
            onClick={() => { window.location.href = '/online-registration'; }}
            className="px-6 py-3 bg-[#FF914D] hover:bg-orange-400 text-white font-bold rounded-xl transition-all text-sm">
            Register Another Student
          </button>
        </div>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────────
  if (submitted) {
    const typeLabel = ENROLLMENT_TYPES.find(t => t.id === form.enrollmentType)?.title ?? 'Programme';
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white/[0.04] border border-white/10 rounded-3xl p-10 backdrop-blur-sm">
          <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="inline-block px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-xs font-bold uppercase tracking-widest mb-4">
            {typeLabel}
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-3">Application Submitted!</h2>
          <p className="text-white/50 text-sm leading-relaxed mb-8">
            Thank you, <strong className="text-white">{form.fullName}</strong>! Your {typeLabel.toLowerCase()} application is under review.
            Our team will reach out to <strong className="text-white">{form.parentEmail}</strong> within <strong className="text-white">24–48 hours</strong>.
          </p>
          <button
            onClick={() => { setSubmitted(false); setStep(0); setForm(defaultForm); }}
            className="px-6 py-3 bg-[#FF914D] hover:bg-orange-400 text-white font-bold rounded-xl transition-all text-sm">
            Register Another Student
          </button>
        </div>
      </div>
    );
  }

  const et = form.enrollmentType;
  const schedules = SCHEDULES[et] ?? SCHEDULES[''];
  const selectedSchedule = schedules.find(s => s.value === form.preferredSchedule);
  const feeLabel = selectedSchedule?.feeLabel ?? TYPE_FEES[et] ?? '';
  const feeAmount = selectedSchedule ? `₦${selectedSchedule.fee.toLocaleString()}` : '';

  // ── Main form ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a14] py-16 px-4">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-violet-600/6 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-xs font-bold uppercase tracking-widest mb-5">
            <GraduationCap className="w-3.5 h-3.5" /> Student Enrollment
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-3">Start Your Journey</h1>
          <p className="text-white/40">
            {et === 'bootcamp' && 'Register for our intensive summer coding bootcamp.'}
            {et === 'online' && 'Enrol in our flexible, fully online digital school.'}
            {et === 'school' && 'Register through your partner school programme.'}
            {!et && 'Choose your path and join hundreds of students learning coding, robotics and web development.'}
          </p>
        </div>

        {/* Enrollment type selector — always visible */}
        <div className="mb-6">
          <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">How are you joining?</p>
          <div className="grid grid-cols-3 gap-3">
            {ENROLLMENT_TYPES.map(t => {
              const TIcon = t.icon;
              const active = et === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setForm(p => ({ ...p, enrollmentType: t.id, preferredSchedule: '' })); setErr(''); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border text-center transition-all ${active ? t.color + ' shadow-lg' : 'border-white/10 bg-white/[0.03] hover:bg-white/8 hover:border-white/20'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${active ? 'bg-white/20' : 'bg-white/5'}`}>
                    <TIcon className={`w-4 h-4 ${active ? 'text-white' : 'text-white/30'}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${active ? 'text-white' : 'text-white/50'}`}>{t.title}</p>
                  </div>
                  {active && <div className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
                </button>
              );
            })}
          </div>
          {!et && err && <p className="text-rose-400 text-xs mt-2">{err}</p>}
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-0">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            const SIcon = s.icon;
            return (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
                    ${done ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' :
                      current ? 'bg-[#FF914D] shadow-lg shadow-orange-500/30' :
                        'bg-white/5 border border-white/10'}`}>
                    {done
                      ? <Check className="w-4 h-4 text-white" />
                      : <SIcon className={`w-4 h-4 ${current ? 'text-white' : 'text-white/30'}`} />}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${current ? 'text-white' : 'text-white/25'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-16 h-px mx-2 mb-4 transition-all ${i < step ? 'bg-emerald-500' : 'bg-white/10'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Form card */}
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
          <form onSubmit={step < STEPS.length - 1 ? next : handleSubmit}>
            <div className="space-y-5 min-h-[280px]">

              {/* ── Step 1: Student ── */}
              {step === 0 && (
                <>
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/30 pb-3 border-b border-white/10">About the Student</h3>
                  <Field label="Full Name *" icon={User}>
                    <input type="text" name="fullName" value={form.fullName} onChange={set} required
                      autoCapitalize="words"
                      autoComplete="name"
                      placeholder="Student's full name" className={inputCls()} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Date of Birth *" icon={Calendar}>
                      <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={set} required
                        max={new Date().toISOString().slice(0, 10)}
                        className={inputCls() + ' cursor-pointer'} />
                    </Field>
                    <Field label="Gender *">
                      <select name="gender" value={form.gender} onChange={set} required className={selectCls()}>
                        <option value="">Select…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="other">Prefer not to say</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                    </Field>
                  </div>
                  <Field label="Grade / Class *">
                    <select name="grade" value={form.grade} onChange={set} required className={selectCls()}>
                      <option value="">Select class…</option>
                      <option value="Primary 1-3">Primary 1–3</option>
                      <option value="Primary 4-6">Primary 4–6</option>
                      <option value="JSS 1-3">JSS 1–3</option>
                      <option value="SSS 1-3">SSS 1–3</option>
                      <option value="University / Tertiary">University / Tertiary</option>
                      <option value="Adult Learner">Adult Learner</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  </Field>

                  {/* School field — required for partner school, optional otherwise */}
                  <Field label={et === 'school' ? 'Current School *' : 'School / Organisation (Optional)'} icon={School}>
                    {et === 'school' ? (
                      <select name="currentSchool" value={form.currentSchool} onChange={set} required className={selectCls(true)}>
                        <option value="">Select partner school…</option>
                        {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        <option value="Other">Other / Not listed</option>
                      </select>
                    ) : (
                      <input type="text" name="currentSchool" value={form.currentSchool} onChange={set}
                        autoCapitalize="words"
                        placeholder="School name (if applicable)"
                        className={inputCls()} />
                    )}
                    {et === 'school' && <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />}
                  </Field>

                  {/* Student email — useful for online/bootcamp (they may have their own) */}
                  {(et === 'online' || et === 'bootcamp') && (
                    <Field label="Student Email (Optional)" icon={Mail}>
                      <input type="email" name="studentEmail" value={form.studentEmail} onChange={set}
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        placeholder="student@email.com (if they have one)"
                        className={inputCls()} />
                    </Field>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="City" icon={MapPin}>
                      <input type="text" name="city" value={form.city} onChange={set}
                        autoCapitalize="words"
                        placeholder="e.g. Lagos" className={inputCls()} />
                    </Field>
                    <Field label="State *">
                      <select name="state" value={form.state} onChange={set} required className={selectCls()}>
                        <option value="">Select state…</option>
                        {NIGERIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                    </Field>
                  </div>
                </>
              )}

              {/* ── Step 2: Parent ── */}
              {step === 1 && (
                <>
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/30 pb-3 border-b border-white/10">Parent / Guardian Information</h3>
                  <Field label="Parent Full Name *" icon={User}>
                    <input type="text" name="parentName" value={form.parentName} onChange={set} required
                      autoCapitalize="words"
                      autoComplete="name"
                      placeholder="Parent / Guardian full name" className={inputCls()} />
                  </Field>
                  <Field label="Relationship to Student *" icon={Heart}>
                    <select name="parentRelationship" value={form.parentRelationship} onChange={set} required
                      className={selectCls(true)}>
                      <option value="">Select…</option>
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Guardian">Guardian</option>
                      <option value="Sibling">Sibling</option>
                      <option value="Self">Self (adult learner)</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  </Field>
                  <Field label="Phone Number *" icon={Phone}>
                    <input type="tel" name="parentPhone" value={form.parentPhone} onChange={set} required
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+234 800 000 0000" className={inputCls()} />
                  </Field>
                  <Field label="Email Address *" icon={Mail}>
                    <input type="email" name="parentEmail" value={form.parentEmail} onChange={set} required
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="email"
                      placeholder="parent@email.com" className={inputCls()} />
                  </Field>
                </>
              )}

              {/* ── Step 3: Preferences ── */}
              {step === 2 && (
                <>
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/30 pb-3 border-b border-white/10">Programme Preferences</h3>
                  <Field label="Course Interest *" icon={BookOpen}>
                    <select name="courseInterest" value={form.courseInterest} onChange={set} required
                      className={selectCls(true)}>
                      <option value="">I&apos;m interested in…</option>
                      <option value="ICT Fundamentals">ICT Fundamentals</option>
                      <option value="Python Programming">Python Programming</option>
                      <option value="Web Design">Web Design &amp; Development</option>
                      <option value="Robotics">Robotics &amp; IoT</option>
                      <option value="AI & Data Science">AI &amp; Data Science</option>
                      <option value="Cybersecurity Basics">Cybersecurity Basics</option>
                      <option value="Open to anything">Open to all programmes</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  </Field>

                  <Field label="Preferred Schedule *" icon={Calendar}>
                    <select name="preferredSchedule" value={form.preferredSchedule} onChange={set} required
                      className={selectCls(true)}>
                      <option value="">Select schedule…</option>
                      {schedules.map(s => (
                        <option key={s.value} value={s.value}>{s.label} — {s.feeLabel}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  </Field>

                  <Field label="How did you hear about us?">
                    <select name="hearAboutUs" value={form.hearAboutUs} onChange={set} className={selectCls()}>
                      <option value="">Select…</option>
                      <option value="Social Media">Social Media</option>
                      <option value="Friend / Family">Friend or Family</option>
                      <option value="School">Through School</option>
                      <option value="Flyer / Banner">Flyer / Banner</option>
                      <option value="Online Search">Online Search</option>
                      <option value="Radio / TV">Radio / TV</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  </Field>

                  {/* Programme type badge + fee */}
                  {et && (
                    <div className="bg-[#FF914D]/10 border border-[#FF914D]/20 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#FF914D]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-4 h-4 text-[#FF914D]" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">
                          {ENROLLMENT_TYPES.find(t => t.id === et)?.title}
                          {feeLabel ? ` · ${feeLabel}` : feeLabel === '' ? ` · ${TYPE_FEES[et]}` : ''}
                        </p>
                        <p className="text-xs text-white/40">
                          {feeAmount ? `${feeAmount} — pay now to secure your spot` : 'Select a schedule to see pricing'} · Powered by Paystack
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Terms */}
                  <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4 border border-white/10">
                    <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set}
                      className="mt-0.5 w-4 h-4 accent-[#FF914D] cursor-pointer flex-shrink-0" />
                    <label htmlFor="terms" className="text-sm text-white/50 leading-relaxed cursor-pointer">
                      I confirm the information above is accurate and agree to Rillcod Academy&apos;s{' '}
                      <span className="text-[#FF914D] underline">Terms &amp; Conditions</span>.
                    </label>
                  </div>
                  {err && <p className="text-rose-400 text-sm">{err}</p>}
                </>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
              <button type="button" onClick={back}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 transition-all ${step === 0 ? 'invisible' : ''}`}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button type="submit" disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#FF914D] hover:bg-orange-400 text-white transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to payment…</>
                ) : step < STEPS.length - 1 ? (
                  <>Next Step <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Pay {feeAmount || TYPE_FEES[et] || '...'} to Enrol <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-6 mt-8 text-xs text-white/20 font-medium">
          <span>✓ Secure payment</span>
          <span>✓ Powered by Paystack</span>
          <span>✓ Review within 48hrs</span>
        </div>
      </div>
    </div>
  );
}
