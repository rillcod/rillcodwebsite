'use client';

import React, { useState } from 'react';
import { Building2, Check, Loader2, ChevronDown, MapPin, Phone, Mail, User, Users, Layers, ArrowRight, ShieldCheck, Scale, Globe } from 'lucide-react';

const STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

function Field({ label, icon: Icon, error, children }: { label: string; icon?: any; error?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{label}</label>
            <div className="relative group">
                {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none z-10" />}
                {children}
            </div>
            {error && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2 ml-1">{error}</p>}
        </div>
    );
}

const inputCls = (hasIcon = true) =>
    `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-6 py-5 bg-background border border-border rounded-none text-sm font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all`;

const selectCls = (hasIcon = false) =>
    `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-10 py-5 bg-background border border-border rounded-none text-sm font-bold text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer`;

function PartnershipTermsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 border-t-8 border-t-primary">
                <div className="p-8 sm:p-12 max-h-[85vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-4 mb-10 pb-6 border-b border-border">
                        <div className="w-12 h-12 bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Scale className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Partnership Terms</h2>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Legal Framework v2.0</p>
                        </div>
                    </div>

                    <div className="space-y-10 text-muted-foreground text-sm leading-relaxed">
                        <section className="space-y-4">
                            <h3 className="text-foreground font-black uppercase tracking-widest flex items-center gap-3">
                                <span className="text-primary">01.</span> Revenue Share
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                <div className="p-6 bg-background border border-border">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-primary mb-1">Rillcod Technologies</p>
                                    <p className="text-3xl font-black text-foreground">70%</p>
                                    <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase">Curriculum & Infrastructure</p>
                                </div>
                                <div className="p-6 bg-background border border-border">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-blue-400 mb-1">Partner School</p>
                                    <p className="text-3xl font-black text-foreground">30%</p>
                                    <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase">Facility Management</p>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h3 className="text-foreground font-black uppercase tracking-widest flex items-center gap-3">
                                <span className="text-primary">02.</span> Core Obligations
                            </h3>
                            <div className="space-y-4">
                                <div className="p-6 bg-background border border-border border-l-4 border-l-primary">
                                    <p className="font-black text-foreground text-[10px] uppercase tracking-widest mb-4">Rillcod Provides:</p>
                                    <ul className="space-y-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                        <li className="flex items-center gap-2">✓ Proprietary STEM Curriculum</li>
                                        <li className="flex items-center gap-2">✓ Portal & LMS Access</li>
                                        <li className="flex items-center gap-2">✓ Teacher Training & Certification</li>
                                    </ul>
                                </div>
                                <div className="p-6 bg-background border border-border border-l-4 border-l-blue-500">
                                    <p className="font-black text-foreground text-[10px] uppercase tracking-widest mb-4">School Provides:</p>
                                    <ul className="space-y-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                        <li className="flex items-center gap-2">✓ Computer Labs or Devices</li>
                                        <li className="flex items-center gap-2">✓ Student Enrolment Records</li>
                                        <li className="flex items-center gap-2">✓ Programme Promotion</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 pt-6 border-t border-border">
                            <p className="italic text-xs">All intellectual property and curriculum materials remain the exclusive property of Rillcod Technologies and may only be used by authorised partner institutions.</p>
                        </section>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-10 py-5 bg-primary hover:bg-primary text-white font-black transition-all uppercase tracking-[0.4em] text-xs shadow-xl shadow-primary/20"
                    >
                        I Understand — Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export function SchoolRegistration() {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [err, setErr] = useState('');
    const [statusEmail, setStatusEmail] = useState('');
    const [statusLoading, setStatusLoading] = useState(false);
    const [statusResult, setStatusResult] = useState<any | null>(null);
    const [statusError, setStatusError] = useState('');
    const [showTerms, setShowTerms] = useState(false);

    const [form, setForm] = useState({
        schoolName: '', schoolType: '', principalName: '',
        schoolAddress: '', lga: '', city: '', state: '',
        schoolPhone: '', schoolEmail: '',
        studentCount: '', programInterest: '', termsAgreement: false,
    });

    const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.termsAgreement) { setErr('Please accept the terms to continue.'); return; }
        setLoading(true); setErr('');
        try {
            const res = await fetch('/api/schools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolName: form.schoolName,
                    schoolType: form.schoolType,
                    principalName: form.principalName,
                    schoolAddress: form.schoolAddress,
                    lga: form.lga,
                    city: form.city,
                    state: form.state,
                    schoolPhone: form.schoolPhone,
                    schoolEmail: form.schoolEmail,
                    studentCount: form.studentCount,
                    programInterest: form.programInterest
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Submission failed. Please try again.');
            setSubmitted(true);
        } catch (e: any) {
            setErr(e.message ?? 'Submission failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) return (
        <div className="bg-card border border-border p-12 text-center shadow-2xl border-t-4 border-t-emerald-500">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8">
                <Check className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight mb-4">Application Submitted</h2>
            <p className="text-muted-foreground font-medium mb-8">
                Your application for <strong className="text-foreground">{form.schoolName}</strong> has been received. Our team will review and contact you within 48 hours.
            </p>
            <button onClick={() => setSubmitted(false)}
                className="px-10 py-5 bg-primary text-white font-black text-xs uppercase tracking-[0.4em] hover:bg-primary transition-all">
                Submit Another Application
            </button>
        </div>
    );

    return (
        <div className="w-full relative py-12">
            <PartnershipTermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />

            {/* Header */}
            <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest mb-6">
                    <Building2 className="w-4 h-4" /> School Partnership
                </div>
                <h1 className="text-4xl sm:text-6xl font-black text-foreground leading-none tracking-tight uppercase mb-4">
                    REGISTER <br />
                    <span className="text-foreground/40 italic">SCHOOL.</span>
                </h1>
                <p className="text-lg text-muted-foreground font-medium italic max-w-lg mx-auto border-l-2 border-primary pl-6 mt-8 hidden sm:block">
                    Join our network of partner schools delivering world-class STEM education to students across West Africa.
                </p>
            </div>

            {/* Application Status Check */}
            <div className="bg-card border border-border border-l-4 border-l-blue-500 p-6 mb-8">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="flex-1 text-center sm:text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Already Applied?</p>
                        <h4 className="text-base font-black text-foreground uppercase tracking-tight">Check Application Status</h4>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Enter your school email to check your application.</p>
                    </div>
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3">
                        <div className="relative">
                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                type="email" value={statusEmail} onChange={(e) => setStatusEmail(e.target.value)}
                                placeholder="admin@yourschool.edu.ng"
                                className="bg-background border border-border pl-12 pr-5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-blue-500 transition-all w-full sm:w-64"
                            />
                        </div>
                        <button
                            type="button" disabled={statusLoading || !statusEmail}
                            onClick={async () => {
                                if (!statusEmail) return;
                                setStatusLoading(true); setStatusError(''); setStatusResult(null);
                                try {
                                    const res = await fetch(`/api/schools?email=${encodeURIComponent(statusEmail)}`);
                                    const json = await res.json();
                                    if (!res.ok) throw new Error(json.error || 'No application found for this email.');
                                    setStatusResult(json.school);
                                } catch (e: any) { setStatusError(e.message ?? 'No application found.'); }
                                finally { setStatusLoading(false); }
                            }}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                        >
                            {statusLoading ? 'Checking...' : 'Check Status'}
                        </button>
                    </div>
                </div>
                {statusError && (
                    <p className="mt-4 text-rose-400 text-xs font-bold bg-rose-500/5 border border-rose-500/10 p-3 text-center">{statusError}</p>
                )}
                {statusResult && (
                    <div className="mt-5 p-4 bg-muted/30 border border-border flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border ${statusResult.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : statusResult.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                {statusResult.status === 'approved' ? 'Approved' : statusResult.status === 'rejected' ? 'Rejected' : 'Pending Review'}
                            </span>
                            <p className="text-sm font-bold text-foreground">{statusResult.name}</p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Applied: {statusResult.created_at ? new Date(statusResult.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </p>
                    </div>
                )}
            </div>

            {/* Registration Form */}
            <div className="bg-card border border-border p-8 md:p-12 shadow-2xl border-t-4 border-t-primary">
                <form onSubmit={handleSubmit} className="space-y-12">

                    <section className="space-y-8">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] pb-4 border-b border-border">01 — School Information</h3>
                        <Field label="Legal School Name *" icon={Building2}>
                            <input type="text" name="schoolName" value={form.schoolName} onChange={set} required placeholder="As registered with CAC" className={inputCls()} />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="School Type *">
                                <select name="schoolType" value={form.schoolType} onChange={set} required className={selectCls()}>
                                    <option value="">Select Type</option>
                                    <option value="Primary">Primary School</option>
                                    <option value="Secondary">Secondary School</option>
                                    <option value="Both">Primary & Secondary (K-12)</option>
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </Field>
                            <Field label="Principal / Head Teacher *" icon={User}>
                                <input type="text" name="principalName" value={form.principalName} onChange={set} required placeholder="Full name" className={inputCls()} />
                            </Field>
                        </div>

                        <Field label="School Address *" icon={MapPin}>
                            <input type="text" name="schoolAddress" value={form.schoolAddress} onChange={set} required placeholder="Street address" className={inputCls()} />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                            <Field label="LGA *">
                                <input type="text" name="lga" value={form.lga} onChange={set} required placeholder="Local Government Area" className={inputCls(false)} />
                            </Field>
                            <Field label="City">
                                <input type="text" name="city" value={form.city} onChange={set} placeholder="City" className={inputCls(false)} />
                            </Field>
                            <Field label="State *">
                                <select name="state" value={form.state} onChange={set} required className={selectCls()}>
                                    <option value="">Select State</option>
                                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-8 pt-8 border-t border-border">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] pb-4 border-b border-border">02 — Contact Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Phone Number *" icon={Phone}>
                                <input type="tel" name="schoolPhone" value={form.schoolPhone} onChange={set} required placeholder="+234..." className={inputCls()} />
                            </Field>
                            <Field label="Official Email Address *" icon={Mail}>
                                <input type="email" name="schoolEmail" value={form.schoolEmail} onChange={set} required placeholder="admin@yourschool.edu.ng" className={inputCls()} />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-8 pt-8 border-t border-border">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] pb-4 border-b border-border">03 — Capacity & Programme</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Total Student Population *" icon={Users}>
                                <input type="number" name="studentCount" value={form.studentCount} onChange={set} required placeholder="Estimated number of students" className={inputCls()} />
                            </Field>
                            <Field label="Programme Interest *" icon={Layers}>
                                <select name="programInterest" value={form.programInterest} onChange={set} required className={selectCls(true)}>
                                    <option value="">Select Programme</option>
                                    <option value="Coding Fundamentals">Coding Fundamentals</option>
                                    <option value="Web Development">Web Development</option>
                                    <option value="Robotics Programming">Robotics & IoT</option>
                                    <option value="All Programmes">All Programmes</option>
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </Field>
                        </div>
                    </section>

                    <div className="space-y-5 pt-4">
                        <div className="flex items-start gap-4 p-5 bg-muted/20 border border-border">
                            <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-5 h-5 accent-primary cursor-pointer flex-shrink-0" />
                            <label htmlFor="terms" className="text-[11px] font-bold text-muted-foreground leading-relaxed cursor-pointer">
                                I confirm all information for <span className="text-foreground font-black">{form.schoolName || 'this school'}</span> is accurate. I agree to the{' '}
                                <span onClick={(e) => { e.preventDefault(); setShowTerms(true); }} className="text-primary underline cursor-pointer font-black">Partnership Terms</span>.
                            </label>
                        </div>

                        {err && (
                            <div className="bg-rose-500/10 border border-rose-500/20 p-4 text-rose-400 text-sm font-medium text-center">{err}</div>
                        )}

                        <div className="flex gap-4">
                            <button type="button" onClick={() => window.location.href = '/'}
                                className="flex-1 py-6 bg-muted border border-border text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all">
                                Cancel
                            </button>
                            <button type="submit" disabled={loading}
                                className="flex-[2] flex items-center justify-center gap-4 py-6 bg-primary text-white font-black text-xs uppercase tracking-[0.4em] hover:bg-primary transition-all shadow-xl shadow-primary/20 disabled:opacity-50">
                                {loading
                                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                                    : <><ArrowRight className="w-5 h-5" /> Submit Partnership Application</>}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-8 mt-12 opacity-40">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-foreground">
                    <ShieldCheck className="w-3 h-3 text-primary" /> SSL Secured
                </div>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-foreground">
                    <Globe className="w-3 h-3 text-blue-500" /> West Africa Network
                </div>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-foreground">
                    <Users className="w-3 h-3 text-emerald-500" /> 50+ Partner Schools
                </div>
            </div>
        </div>
    );
}
