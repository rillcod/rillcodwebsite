'use client';

import React, { useState } from 'react';
import { fetchActionJson, friendlyActionError } from '@/lib/async-timeout';
import { Building2, Check, Loader2, ChevronDown, MapPin, Phone, Mail, User, Users, Layers, ArrowRight, ShieldCheck, Scale, Globe } from 'lucide-react';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';

const STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

/**
 * Same wiring as the learner enrolment form: the control arrives as children, so the
 * id is generated here and injected, and the caption points at it. The rejection
 * message is joined through aria-describedby and marks the field aria-invalid, so a
 * school being told why its application failed hears it rather than only seeing it.
 */
function Field({ label, icon: Icon, error, children }: { label: string; icon?: any; error?: string; children: React.ReactNode }) {
    const generatedId = React.useId();
    const child = React.isValidElement(children) ? children : null;
    const childId = (child?.props as { id?: string } | undefined)?.id;
    const fieldId = childId ?? generatedId;
    const errorId = `${fieldId}-error`;
    const labelled = child && !childId
        ? React.cloneElement(child as React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>, {
            id: fieldId,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': error ? errorId : undefined,
        })
        : children;

    return (
        <div className="space-y-2">
            <label htmlFor={fieldId} className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{label}</label>
            <div className="relative group">
                {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none z-10" />}
                {labelled}
            </div>
            {error && <p id={errorId} className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2 ml-1">{error}</p>}
        </div>
    );
}

const inputCls = (hasIcon = true) =>
    `w-full ${hasIcon ? 'pl-12' : 'pl-4'} pr-4 py-3.5 bg-background border border-border rounded-2xl text-xs sm:text-sm font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 transition-all shadow-sm`;

const selectCls = (hasIcon = false) =>
    `w-full ${hasIcon ? 'pl-12' : 'pl-4'} pr-10 py-3.5 bg-background border border-border rounded-2xl text-xs sm:text-sm font-bold text-foreground focus:outline-none focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 transition-all appearance-none cursor-pointer shadow-sm`;

function PartnershipTermsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-card border border-border/80 shadow-2xl rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-300 border-t-4 border-t-brand-red-600">
                <div className="p-6 sm:p-10 max-h-[85vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-4 mb-8 pb-4 border-b border-border/80">
                        <div className="w-12 h-12 rounded-2xl bg-brand-red-600/10 border border-brand-red-500/20 flex items-center justify-center text-brand-red-500">
                            <Scale className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">Partnership Terms</h2>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Turnkey Legal Framework v2.0</p>
                        </div>
                    </div>

                    <div className="space-y-8 text-muted-foreground text-xs sm:text-sm leading-relaxed">
                        <section className="space-y-3">
                            <h3 className="text-foreground font-black uppercase tracking-wider flex items-center gap-2">
                                <span className="text-brand-red-500">01.</span> Revenue Share
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                <div className="p-5 bg-background border border-border rounded-2xl">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-brand-red-500 mb-1">Rillcod Technologies</p>
                                    <p className="text-2xl sm:text-3xl font-black text-foreground">70%</p>
                                    <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase">Facilitators, Hardware & LMS</p>
                                </div>
                                <div className="p-5 bg-background border border-border rounded-2xl">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-emerald-500 mb-1">Partner School</p>
                                    <p className="text-2xl sm:text-3xl font-black text-foreground">30%</p>
                                    <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase">Direct School Profit Share</p>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-foreground font-black uppercase tracking-wider flex items-center gap-2">
                                <span className="text-brand-red-500">02.</span> Core Obligations
                            </h3>
                            <div className="space-y-3">
                                <div className="p-5 bg-background border border-border rounded-2xl border-l-4 border-l-brand-red-600">
                                    <p className="font-black text-foreground text-[10px] uppercase tracking-widest mb-2">Rillcod Provides:</p>
                                    <ul className="space-y-1.5 text-xs font-bold text-muted-foreground">
                                        <li className="flex items-center gap-2">✓ Dedicated certified facilitators deployed to school</li>
                                        <li className="flex items-center gap-2">✓ Full robotics equipment kits (₦0 CapEx from school)</li>
                                        <li className="flex items-center gap-2">✓ 12-Year progressive STEM curriculum (Grade 1 – 12)</li>
                                        <li className="flex items-center gap-2">✓ Automated termly progress reports with video QR codes</li>
                                    </ul>
                                </div>
                                <div className="p-5 bg-background border border-border rounded-2xl border-l-4 border-l-emerald-500">
                                    <p className="font-black text-foreground text-[10px] uppercase tracking-widest mb-2">School Provides:</p>
                                    <ul className="space-y-1.5 text-xs font-bold text-muted-foreground">
                                        <li className="flex items-center gap-2">✓ Classrooms or Computer Laboratory space</li>
                                        <li className="flex items-center gap-2">✓ Timetable allocation for STEM sessions</li>
                                        <li className="flex items-center gap-2">✓ Student enrolment &amp; fee collection</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="pt-4 border-t border-border/80">
                            <p className="italic text-xs">All intellectual property and curriculum materials remain the exclusive property of Rillcod Technologies and may only be used by authorised partner institutions.</p>
                        </section>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-8 py-4 bg-brand-red-600 hover:bg-brand-red-500 text-white font-black rounded-2xl transition-all uppercase tracking-[0.2em] text-xs shadow-xl shadow-brand-red-950/40 cursor-pointer min-h-[48px]"
                    >
                        I Understand — Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export function SchoolRegistration() {
    const isNativeApp = useIsNativeApp();
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
            const { response: res, data } = await fetchActionJson<{ error?: string }>('/api/schools', {
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
            if (!res.ok) throw new Error(data.error || 'Submission failed. Please try again.');
            setSubmitted(true);
        } catch (e: unknown) {
            setErr(friendlyActionError(e, 'Submission failed. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    if (submitted) return (
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 sm:p-12 text-center shadow-2xl border-t-4 border-t-emerald-500">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight mb-3">Application Submitted</h2>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-8 max-w-lg mx-auto">
                Your partnership application for <strong className="text-foreground">{form.schoolName}</strong> has been received. Our advisory team will review and issue your formal proposal within 48 hours.
            </p>
            <button onClick={() => setSubmitted(false)}
                className="px-8 py-4 bg-brand-red-600 hover:bg-brand-red-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-brand-red-950/40 min-h-[48px]">
                Submit Another Application
            </button>
        </div>
    );

    return (
        <div className="w-full relative py-4 sm:py-8 font-sans">
            <PartnershipTermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />

            {/* Header */}
            <div className="text-center mb-8 sm:mb-12 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-12 shadow-xl relative overflow-hidden">
                <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="relative z-10">
                    <span className="inline-block px-4 py-1.5 bg-brand-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm mb-4">
                        School Partnership Program
                    </span>
                    <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground leading-tight tracking-tight uppercase mb-4">
                        REGISTER <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 to-primary">YOUR SCHOOL.</span>
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-lg mx-auto border-l-2 border-brand-red-600 pl-4 sm:pl-6 text-left">
                        Join our network of partner schools delivering turnkey robotics, AI, and coding with zero equipment CapEx and 30% direct revenue share.
                    </p>
                </div>
            </div>

            {/* Application Status Check */}
            <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl border-l-4 border-l-brand-red-600 p-5 sm:p-8 mb-8 shadow-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-brand-red-500" /> Application Status Tracker
                        </h4>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Enter your school email to check the status of your application.</p>
                    </div>
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2.5">
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                type="email" value={statusEmail} onChange={(e) => setStatusEmail(e.target.value)}
                                placeholder="admin@yourschool.edu.ng"
                                className="bg-background border border-border rounded-2xl pl-11 pr-4 py-2.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand-red-500 transition-all w-full sm:w-64"
                            />
                        </div>
                        <button
                            type="button" disabled={statusLoading || !statusEmail}
                            onClick={async () => {
                                if (!statusEmail) return;
                                setStatusLoading(true); setStatusError(''); setStatusResult(null);
                                try {
                                    const { response: res, data: json } = await fetchActionJson<{ error?: string; school?: typeof statusResult }>(
                                        `/api/schools?email=${encodeURIComponent(statusEmail)}`,
                                    );
                                    if (!res.ok) throw new Error(json.error || 'No application found for this email.');
                                    setStatusResult(json.school ?? null);
                                } catch (e: unknown) { setStatusError(friendlyActionError(e, 'No application found.')); }
                                finally { setStatusLoading(false); }
                            }}
                            className="px-5 py-2.5 bg-brand-red-600 hover:bg-brand-red-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50 shadow-md shadow-brand-red-950/40 min-h-[42px]"
                        >
                            {statusLoading ? 'Checking...' : 'Check Status'}
                        </button>
                    </div>
                </div>
                {statusError && (
                    <p className="mt-4 text-rose-400 text-xs font-bold bg-rose-500/10 border border-rose-500/20 p-3 rounded-2xl text-center">{statusError}</p>
                )}
                {statusResult && (
                    <div className="mt-4 p-4 bg-muted/40 border border-border rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border ${statusResult.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : statusResult.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                {statusResult.status === 'approved' ? 'Approved' : statusResult.status === 'rejected' ? 'Rejected' : 'Pending Review'}
                            </span>
                            <p className="text-xs sm:text-sm font-bold text-foreground">{statusResult.name}</p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Applied: {statusResult.created_at ? new Date(statusResult.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </p>
                    </div>
                )}
            </div>

            {/* Registration Form */}
            <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-10 shadow-2xl border-t-4 border-t-brand-red-600">
                <form onSubmit={handleSubmit} className="space-y-10">

                    <section className="space-y-6">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pb-3 border-b border-border/80">01 — School Information</h3>
                        <Field label="Legal School Name *" icon={Building2}>
                            <input type="text" name="schoolName" value={form.schoolName} onChange={set} required placeholder="As registered with CAC / Ministry of Education" className={inputCls()} />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <Field label="School Type *">
                                <select name="schoolType" value={form.schoolType} onChange={set} required className={selectCls()}>
                                    <option value="">Select Type</option>
                                    <option value="Primary">Primary School (Basic 1 – 6)</option>
                                    <option value="Secondary">Secondary School (JSS 1 – SS 3)</option>
                                    <option value="Both">Primary &amp; Secondary (K-12 Full)</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </Field>
                            <Field label="Principal / Head of School *" icon={User}>
                                <input type="text" name="principalName" value={form.principalName} onChange={set} required placeholder="Full name of leadership" className={inputCls()} />
                            </Field>
                        </div>

                        <Field label="School Address *" icon={MapPin}>
                            <input type="text" name="schoolAddress" value={form.schoolAddress} onChange={set} required placeholder="Physical campus address" className={inputCls()} />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <Field label="LGA *">
                                <input type="text" name="lga" value={form.lga} onChange={set} required placeholder="Local Government Area" className={inputCls(false)} />
                            </Field>
                            <Field label="City">
                                <input type="text" name="city" value={form.city} onChange={set} placeholder="City / Town" className={inputCls(false)} />
                            </Field>
                            <Field label="State *">
                                <select name="state" value={form.state} onChange={set} required className={selectCls()}>
                                    <option value="">Select State</option>
                                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-6 pt-6 border-t border-border/80">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pb-3 border-b border-border/80">02 — Contact Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <Field label="Phone Number *" icon={Phone}>
                                <input type="tel" name="schoolPhone" value={form.schoolPhone} onChange={set} required placeholder="+234..." className={inputCls()} />
                            </Field>
                            <Field label="Official School Email *" icon={Mail}>
                                <input type="email" name="schoolEmail" value={form.schoolEmail} onChange={set} required placeholder="admin@yourschool.edu.ng" className={inputCls()} />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-6 pt-6 border-t border-border/80">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pb-3 border-b border-border/80">03 — Capacity &amp; Programme</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <Field label="Estimated Student Population *" icon={Users}>
                                <input type="number" name="studentCount" value={form.studentCount} onChange={set} required placeholder="e.g. 250" className={inputCls()} />
                            </Field>
                            <Field label="Programme Focus *" icon={Layers}>
                                <select name="programInterest" value={form.programInterest} onChange={set} required className={selectCls(true)}>
                                    <option value="">Select Focus</option>
                                    <option value="All Programmes">Turnkey STEM Ecosystem (Coding, Robotics &amp; AI)</option>
                                    <option value="Robotics Programming">Robotics &amp; Physical Hardware</option>
                                    <option value="Coding Fundamentals">Software &amp; Python Coding</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </Field>
                        </div>
                    </section>

                    <div className="space-y-4 pt-4">
                        <div className="flex items-start gap-3.5 p-4 bg-muted/40 border border-border/80 rounded-2xl">
                            <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-4 h-4 rounded text-brand-red-600 focus:ring-0 cursor-pointer shrink-0" />
                            <label htmlFor="terms" className="text-xs font-semibold text-muted-foreground leading-relaxed cursor-pointer">
                                I confirm information for <span className="text-foreground font-black">{form.schoolName || 'this institution'}</span> is accurate. I agree to the{' '}
                                <span onClick={(e) => { e.preventDefault(); setShowTerms(true); }} className="text-brand-red-500 underline cursor-pointer font-bold">Partnership Terms (70/30 Model)</span>.
                            </label>
                        </div>

                        {err && (
                            <div className="bg-rose-500/10 border border-rose-500/20 p-3.5 text-rose-400 text-xs font-bold rounded-2xl text-center">{err}</div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="button" onClick={() => { window.location.href = isNativeApp ? '/login' : '/'; }}
                                className="w-full sm:w-auto px-6 py-3.5 bg-card border border-border text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-wider rounded-2xl transition-all min-h-[48px]">
                                Cancel
                            </button>
                            <button type="submit" disabled={loading}
                                className="w-full sm:flex-1 flex items-center justify-center gap-2 px-8 py-3.5 bg-brand-red-600 hover:bg-brand-red-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-brand-red-950/40 disabled:opacity-50 min-h-[48px] cursor-pointer">
                                {loading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting Application...</>
                                    : <><ArrowRight className="w-4 h-4" /> Submit Partnership Application</>}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 mt-8 opacity-60 text-xs">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> SSL 256-Bit Encrypted
                </div>
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted-foreground">
                    <Globe className="w-4 h-4 text-primary" /> West Africa Network
                </div>
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted-foreground">
                    <Users className="w-4 h-4 text-brand-red-500" /> 25+ Accredited Partner Schools
                </div>
            </div>
        </div>
    );
}
