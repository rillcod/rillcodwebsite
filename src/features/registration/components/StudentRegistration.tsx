'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  User, Check, ArrowRight, ArrowLeft, Loader2, GraduationCap,
  Phone, Mail, School, BookOpen, Calendar, ChevronDown, MapPin,
  Heart, Globe, Sun, Building2, Home,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Enrollment types ─────────────────────────────────────────────
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
    title: 'Summer Bootcamp',
    desc: 'Intensive seasonal programme — no school affiliation required',
    color: 'border-orange-500 bg-orange-500/10',
    dot: 'bg-orange-400',
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
    <div className="space-y-2">
      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors pointer-events-none z-10" />}
        {children}
      </div>
    </div>
  );
}

const inputCls = (hasIcon = true) =>
  `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-6 py-5 bg-[#1a1a1a] border border-white/20 rounded-none text-sm font-bold text-white placeholder:text-slate-700 focus:outline-none focus:border-orange-500 transition-all shadow-inner shadow-black/20`;

const selectCls = (hasIcon = false) =>
  `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-10 py-5 bg-[#1a1a1a] border border-white/20 rounded-none text-sm font-bold text-white focus:outline-none focus:border-orange-500 transition-all appearance-none cursor-pointer shadow-inner shadow-black/20`;

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

const TYPE_FEES: Record<string, string> = {
  school:   '₦20,000 – ₦30,000',
  bootcamp: '₦35,000 – ₦60,000',
  online:   '₦25,000 – ₦40,000',
  '':       '',
};

// ─── Main component ───────────────────────────────────────────────
export function StudentRegistration({ defaultEnrollmentType }: { defaultEnrollmentType?: EnrollmentType }) {
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
    if (!form.enrollmentType) { setErr('Please specify enrollment path.'); return; }
    setErr('');
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const back = () => { setStep(s => Math.max(0, s - 1)); setErr(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.termsAgreement) { setErr('Protocol agreement required.'); return; }
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
      if (!res.ok) throw new Error(data.error || 'Uplink signal lost.');
      window.location.href = data.paymentUrl;
    } catch (e: any) {
      setErr(e.message ?? 'Transmission failed.');
      setLoading(false);
    }
  };

  const paymentStatus = searchParams?.get('payment');
  if (paymentStatus === 'success') {
    return (
      <div className="bg-[#1a1a1a] border border-white/10 p-12 text-center shadow-2xl rounded-none border-t-4 border-t-emerald-500">
         <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8 rounded-none">
            <Check className="w-10 h-10 text-emerald-500" />
         </div>
         <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-4">Confirmed</h2>
         <p className="text-slate-400 font-bold italic mb-8">Uplink successful. Records updated. Our coordination team will reach out via secure email within 24 standard business hours.</p>
         <button onClick={() => window.location.href = '/'} className="px-10 py-5 bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-emerald-600 transition-all">Return to Home</button>
      </div>
    );
  }

  const et = form.enrollmentType;
  const schedules = SCHEDULES[et] ?? SCHEDULES[''];
  const selectedSchedule = schedules.find(s => s.value === form.preferredSchedule);
  const feeLabel = selectedSchedule?.feeLabel ?? TYPE_FEES[et] ?? '';
  const feeAmount = selectedSchedule ? `₦${selectedSchedule.fee.toLocaleString()}` : '';

  return (
    <div className="w-full relative py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none text-orange-500 text-[10px] font-black uppercase tracking-widest mb-6">
            <GraduationCap className="w-4 h-4" /> System Enrollment
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white leading-none tracking-tight uppercase mb-4">
             REGISTER <br />
             <span className="text-white/40 italic">STUDENT.</span>
          </h1>
        </div>

        {/* Enrollment Path Selector */}
        <div className="mb-10">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-4 text-center">Select Career Path</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ENROLLMENT_TYPES.map(t => {
              const active = et === t.id;
              return (
                <button
                  key={t.id} type="button"
                  onClick={() => { setForm(p => ({ ...p, enrollmentType: t.id, preferredSchedule: '' })); setErr(''); }}
                  className={`group flex flex-col items-center gap-4 p-8 border rounded-none transition-all ${active ? t.color + ' shadow-2xl' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'}`}>
                  <div className={`w-12 h-12 flex items-center justify-center rounded-none ${active ? 'bg-white/10 border border-white/20' : 'bg-white/5 border border-white/5'}`}>
                    <t.icon className={`w-6 h-6 ${active ? 'text-white' : 'text-slate-600'}`} />
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-slate-500'}`}>{t.title}</p>
                </button>
              );
            })}
          </div>
          {!et && err && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-4 text-center">{err}</p>}
        </div>

        {/* Form Matrix */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-8 md:p-12 shadow-2xl border-t-4 border-t-orange-500">
          
          {/* Progress Strip */}
          <div className="flex items-center justify-between mb-12 border-b border-white/5 pb-8">
             {STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                   <div className={`w-8 h-8 flex items-center justify-center text-[10px] font-black rounded-none border ${i <= step ? 'bg-orange-500 border-orange-500 text-white' : 'border-white/10 text-slate-700'}`}>
                      {i < step ? <Check className="w-4 h-4" /> : i + 1}
                   </div>
                   <span className={`text-[9px] font-black uppercase tracking-widest hidden sm:block ${i <= step ? 'text-white' : 'text-slate-700'}`}>{s.label}</span>
                </div>
             ))}
          </div>

          <form onSubmit={step < STEPS.length - 1 ? next : handleSubmit} className="space-y-8 min-h-[400px]">
              
              {step === 0 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mb-8 pb-4 border-b border-white/5">01 // Personal Data</h3>
                  <Field label="Full Name *" icon={User}>
                    <input type="text" name="fullName" value={form.fullName} onChange={set} required placeholder="Legal Name" className={inputCls()} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <Field label="Birth Date *" icon={Calendar}>
                      <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={set} required className={inputCls() + ' cursor-pointer'} />
                    </Field>
                    <Field label="Gender *">
                      <select name="gender" value={form.gender} onChange={set} required className={selectCls()}>
                        <option value="">Select Protocol</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    </Field>
                  </div>
                  <Field label="Grade Level / Class *">
                    <select name="grade" value={form.grade} onChange={set} required className={selectCls()}>
                      <option value="">Select Academic Tier</option>
                      <option value="Primary 1-3">Primary 1–3</option>
                      <option value="Primary 4-6">Primary 4–6</option>
                      <option value="JSS 1-3">JSS 1–3</option>
                      <option value="SSS 1-3">SSS 1–3</option>
                      <option value="Adult">Adult Learner</option>
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                  </Field>
                  <Field label={et === 'school' ? 'Partner School *' : 'Origin School (Optional)'} icon={School}>
                    {et === 'school' ? (
                      <select name="currentSchool" value={form.currentSchool} onChange={set} required className={selectCls(true)}>
                        <option value="">Select Verified School</option>
                        {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    ) : (
                      <input type="text" name="currentSchool" value={form.currentSchool} onChange={set} placeholder="Current Institution" className={inputCls()} />
                    )}
                    {et === 'school' && <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />}
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <Field label="City Node" icon={MapPin}>
                       <input type="text" name="city" value={form.city} onChange={set} placeholder="e.g. Benin City" className={inputCls()} />
                    </Field>
                    <Field label="State Node *">
                       <select name="state" value={form.state} onChange={set} required className={selectCls()}>
                          <option value="">Select Sector</option>
                          {NIGERIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                       </select>
                       <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    </Field>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                   <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mb-8 pb-4 border-b border-white/5">02 // Guardian Protocol</h3>
                   <Field label="Full Guardian Name *" icon={User}>
                      <input type="text" name="parentName" value={form.parentName} onChange={set} required placeholder="Full Legal Name" className={inputCls()} />
                   </Field>
                   <Field label="Relationship *" icon={Heart}>
                      <select name="parentRelationship" value={form.parentRelationship} onChange={set} required className={selectCls(true)}>
                         <option value="">Select Relation</option>
                         <option value="Father">Father</option>
                         <option value="Mother">Mother</option>
                         <option value="Guardian">Guardian</option>
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                   </Field>
                   <Field label="Direct Phone Number *" icon={Phone}>
                      <input type="tel" name="parentPhone" value={form.parentPhone} onChange={set} required placeholder="+234..." className={inputCls()} />
                   </Field>
                   <Field label="Secure Email Address *" icon={Mail}>
                      <input type="email" name="parentEmail" value={form.parentEmail} onChange={set} required placeholder="uplink@domain.com" className={inputCls()} />
                   </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                   <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mb-8 pb-4 border-b border-white/5">03 // Final Uplink</h3>
                   <Field label="Programme Interest *" icon={BookOpen}>
                      <select name="courseInterest" value={form.courseInterest} onChange={set} required className={selectCls(true)}>
                         <option value="">Select Intelligence Sector</option>
                         <option value="Python Programming">Python Programming</option>
                         <option value="Robotics">Robotics & IoT</option>
                         <option value="Web Design">Web Architecture</option>
                         <option value="AI & Data Science">AI & Data Science</option>
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                   </Field>

                   <Field label="Engagement Schedule *" icon={Calendar}>
                      <select name="preferredSchedule" value={form.preferredSchedule} onChange={set} required className={selectCls(true)}>
                         <option value="">Select Time Matrix</option>
                         {schedules.map(s => <option key={s.value} value={s.value}>{s.label} — {s.feeLabel}</option>)}
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                   </Field>

                   {et && (
                     <div className="p-8 bg-orange-500/5 border border-white/10 rounded-none italic text-xs font-bold text-slate-400 leading-relaxed">
                        TRANSMISSION FEE: <span className="text-orange-500 text-lg font-black not-italic ml-2">{feeAmount || TYPE_FEES[et]}</span>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-600">Verification managed via Paystack Protocol.</p>
                     </div>
                   )}

                   <div className="flex items-start gap-4 p-6 bg-white/[0.02] border border-white/5 rounded-none">
                      <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-5 h-5 accent-orange-500 cursor-pointer flex-shrink-0" />
                      <label htmlFor="terms" className="text-[11px] font-bold text-slate-500 leading-relaxed cursor-pointer italic">
                                 I hereby initialize this registration and confirm all data records are accurate. I agree to the <span className="text-orange-500 underline">Technologies Service Protocols</span>.
                      </label>
                   </div>
                   {err && <p className="text-rose-500 text-xs font-black uppercase tracking-widest">{err}</p>}
                </div>
              )}

              {/* Control Strip */}
              <div className="flex justify-between items-center pt-8 border-t border-white/5">
                <button 
                  type="button" 
                  onClick={step === 0 ? () => window.location.href = '/' : back} 
                  className="flex items-center gap-3 px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-white transition-colors"
                >
                   {step === 0 ? <Home className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                   {step === 0 ? 'Home' : 'Back'}
                </button>
                <button type="submit" disabled={loading} className="group flex items-center gap-4 px-12 py-5 bg-orange-500 text-white text-[10px] font-black uppercase tracking-[0.4em] rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50">
                   {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uplinking...</>
                   ) : step < STEPS.length - 1 ? (
                      <>Next Protocol <ArrowRight className="w-4 h-4 group-hover:translate-x-1" /></>
                   ) : (
                      <>Initialize Payment <ArrowRight className="w-4 h-4 group-hover:translate-x-1" /></>
                   )}
                </button>
              </div>
          </form>
        </div>
    </div>
  );
}
