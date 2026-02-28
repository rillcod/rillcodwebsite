'use client';

import React, { useState } from 'react';
import { User, Check, ArrowRight, ArrowLeft, Loader2, GraduationCap, Phone, Mail, School, BookOpen, Calendar, ChevronDown, MapPin, Heart } from 'lucide-react';

const STEPS = [
    { label: 'Student Info', icon: User },
    { label: 'Parent Info', icon: Phone },
    { label: 'Programme', icon: BookOpen },
];

const NIGERIAN_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

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

export function StudentRegistration() {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [err, setErr] = useState('');

    const [form, setForm] = useState({
        fullName: '', dateOfBirth: '', grade: '', currentSchool: '', gender: '', city: '', state: '',
        parentName: '', parentPhone: '', parentEmail: '', parentRelationship: '',
        courseInterest: '', preferredSchedule: '', hearAboutUs: '',
        termsAgreement: false,
    });

    const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
    };

    const next = (e: React.FormEvent) => {
        e.preventDefault();
        if (step < STEPS.length - 1) setStep(s => s + 1);
    };

    const back = () => setStep(s => Math.max(0, s - 1));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.termsAgreement) { setErr('Please accept the terms to continue'); return; }
        setLoading(true); setErr('');
        try {
            const res = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.fullName,
                    date_of_birth: form.dateOfBirth || null,
                    gender: form.gender.toLowerCase(),
                    grade_level: form.grade,
                    school_name: form.currentSchool,
                    city: form.city,
                    state: form.state,
                    parent_name: form.parentName,
                    parent_phone: form.parentPhone,
                    parent_email: form.parentEmail,
                    parent_relationship: form.parentRelationship,
                    interests: form.courseInterest,
                    goals: form.preferredSchedule,
                    heard_about_us: form.hearAboutUs,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');
            setSubmitted(true);
        } catch (e: any) {
            setErr(e.message ?? 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) return (
        <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center bg-white/[0.04] border border-white/10 rounded-3xl p-10 backdrop-blur-sm">
                <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Check className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-extrabold text-white mb-3">You&apos;re Registered!</h2>
                <p className="text-white/50 text-sm leading-relaxed mb-8">
                    Welcome, <strong className="text-white">{form.fullName}</strong>! Your application has been submitted. Our team will review it and reach out within <strong className="text-white">24–48 hours</strong>.
                </p>
                <button onClick={() => { setSubmitted(false); setStep(0); setForm({ fullName: '', dateOfBirth: '', grade: '', currentSchool: '', gender: '', city: '', state: '', parentName: '', parentPhone: '', parentEmail: '', parentRelationship: '', courseInterest: '', preferredSchedule: '', hearAboutUs: '', termsAgreement: false }); }}
                    className="px-6 py-3 bg-[#FF914D] hover:bg-orange-400 text-white font-bold rounded-xl transition-all text-sm">
                    Register Another Student
                </button>
            </div>
        </div>
    );

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
                    <p className="text-white/40">Join hundreds of students learning coding, robotics and web development.</p>
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
                                            placeholder="Student's full name" className={inputCls()} />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Date of Birth *" icon={Calendar}>
                                            <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={set} required
                                                max={new Date().toISOString().slice(0, 10)}
                                                className={inputCls() + ' cursor-pointer'} />
                                        </Field>
                                        <Field label="Gender *">
                                            <select name="gender" value={form.gender} onChange={set} required className={inputCls(false) + ' appearance-none cursor-pointer'}>
                                                <option value="">Select…</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="other">Prefer not to say</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                        </Field>
                                    </div>
                                    <Field label="Grade / Class *">
                                        <select name="grade" value={form.grade} onChange={set} required className={inputCls(false) + ' appearance-none cursor-pointer'}>
                                            <option value="">Select class…</option>
                                            <option value="Primary 1-3">Primary 1–3</option>
                                            <option value="Primary 4-6">Primary 4–6</option>
                                            <option value="JSS 1-3">JSS 1–3</option>
                                            <option value="SSS 1-3">SSS 1–3</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                    </Field>
                                    <Field label="Current School *" icon={School}>
                                        <input type="text" name="currentSchool" value={form.currentSchool} onChange={set} required
                                            placeholder="Name of school attending" className={inputCls()} />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="City" icon={MapPin}>
                                            <input type="text" name="city" value={form.city} onChange={set}
                                                placeholder="e.g. Lagos" className={inputCls()} />
                                        </Field>
                                        <Field label="State *">
                                            <select name="state" value={form.state} onChange={set} required className={inputCls(false) + ' appearance-none cursor-pointer'}>
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
                                            placeholder="Parent / Guardian full name" className={inputCls()} />
                                    </Field>
                                    <Field label="Relationship to Student *" icon={Heart}>
                                        <select name="parentRelationship" value={form.parentRelationship} onChange={set} required className={inputCls() + ' appearance-none cursor-pointer'}>
                                            <option value="">Select…</option>
                                            <option value="Father">Father</option>
                                            <option value="Mother">Mother</option>
                                            <option value="Guardian">Guardian</option>
                                            <option value="Sibling">Sibling</option>
                                            <option value="Other">Other</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                    </Field>
                                    <Field label="Phone Number *" icon={Phone}>
                                        <input type="tel" name="parentPhone" value={form.parentPhone} onChange={set} required
                                            placeholder="+234 800 000 0000" className={inputCls()} />
                                    </Field>
                                    <Field label="Email Address *" icon={Mail}>
                                        <input type="email" name="parentEmail" value={form.parentEmail} onChange={set} required
                                            placeholder="parent@email.com" className={inputCls()} />
                                    </Field>
                                </>
                            )}


                            {/* ── Step 3: Preferences ── */}
                            {step === 2 && (
                                <>
                                    <h3 className="text-xs font-black uppercase tracking-widest text-white/30 pb-3 border-b border-white/10">Programme Preferences</h3>
                                    <Field label="Course Interest *" icon={BookOpen}>
                                        <select name="courseInterest" value={form.courseInterest} onChange={set} required className={inputCls() + ' appearance-none cursor-pointer'}>
                                            <option value="">I&apos;m interested in…</option>
                                            <option value="ICT Fundamentals">ICT Fundamentals</option>
                                            <option value="Python Programming">Python Programming</option>
                                            <option value="Web Design">Web Design &amp; Development</option>
                                            <option value="Robotics">Robotics &amp; IoT</option>
                                            <option value="Open to anything">Open to all programmes</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                    </Field>
                                    <Field label="Preferred Schedule *" icon={Calendar}>
                                        <select name="preferredSchedule" value={form.preferredSchedule} onChange={set} required className={inputCls() + ' appearance-none cursor-pointer'}>
                                            <option value="">Select schedule…</option>
                                            <option value="Weekday">Weekday Afternoons</option>
                                            <option value="Weekend">Weekend Classes</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                    </Field>
                                    <Field label="How did you hear about us?">
                                        <select name="hearAboutUs" value={form.hearAboutUs} onChange={set} className={inputCls(false) + ' appearance-none cursor-pointer'}>
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

                                    {/* Fee info */}
                                    <div className="bg-[#FF914D]/10 border border-[#FF914D]/20 rounded-xl p-4 flex items-center gap-3">
                                        <div className="w-8 h-8 bg-[#FF914D]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <GraduationCap className="w-4 h-4 text-[#FF914D]" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">Programme Fee: ₦60,000</p>
                                            <p className="text-xs text-white/40">Payment details will be shared after approval</p>
                                        </div>
                                    </div>

                                    {/* Terms */}
                                    <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4 border border-white/10">
                                        <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set}
                                            className="mt-0.5 w-4 h-4 accent-[#FF914D] cursor-pointer flex-shrink-0" />
                                        <label htmlFor="terms" className="text-sm text-white/50 leading-relaxed cursor-pointer">
                                            I confirm the information above is accurate and agree to Rillcod Academy&apos;s <span className="text-[#FF914D] underline">Terms &amp; Conditions</span>.
                                        </label>
                                    </div>
                                    {err && <p className="text-rose-400 text-sm">{err}</p>}
                                </>
                            )}
                        </div>

                        {/* Navigation buttons */}
                        <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
                            <button type="button" onClick={back}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 transition-all ${step === 0 ? 'invisible' : ''}`}>
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>
                            <button type="submit" disabled={loading}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#FF914D] hover:bg-orange-400 text-white transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50">
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                                ) : step < STEPS.length - 1 ? (
                                    <>Next Step <ArrowRight className="w-4 h-4" /></>
                                ) : (
                                    <>Complete Registration <Check className="w-4 h-4" /></>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Trust */}
                <div className="flex items-center justify-center gap-6 mt-8 text-xs text-white/20 font-medium">
                    <span>✓ Free to register</span>
                    <span>✓ No commitment</span>
                    <span>✓ Review within 48hrs</span>
                </div>
            </div>
        </div>
    );
}
