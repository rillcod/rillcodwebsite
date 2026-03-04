'use client';

import React, { useState } from 'react';
import { Building2, Check, Loader2, ChevronDown, MapPin, Phone, Mail, Users, Layers, ArrowRight } from 'lucide-react';

const STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

function Field({ label, icon: Icon, error, children }: { label: string; icon?: any; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">{label}</label>
            <div className="relative">
                {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />}
                {children}
            </div>
            {error && <p className="text-rose-400 text-xs mt-1">{error}</p>}
        </div>
    );
}

const inputCls = (hasIcon = true) =>
    `w-full ${hasIcon ? 'pl-10' : 'pl-4'} pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D]/60 focus:bg-white/8 transition-all`;

function PartnershipTermsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-[#0a0a14] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-8 sm:p-12 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-[#FF914D]/20 flex items-center justify-center">
                            <Layers className="w-6 h-6 text-[#FF914D]" />
                        </div>
                        <h2 className="text-2xl font-extrabold text-white">Terms of Partnership</h2>
                    </div>

                    <div className="space-y-8 text-white/60 text-sm leading-relaxed">
                        <section>
                            <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                                <Users className="w-4 h-4 text-blue-400" /> 1. Revenue Sharing
                            </h3>
                            <p className="mb-4">Our partnership operates on a transparent revenue distribution model:</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-white/30 mb-1">Rillcod Academy</p>
                                    <p className="text-2xl font-black text-[#FF914D]">70%</p>
                                    <p className="text-[10px] mt-2">Curriculum + Platform + Training</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-white/30 mb-1">Partner School</p>
                                    <p className="text-2xl font-black text-blue-400">30%</p>
                                    <p className="text-[10px] mt-2">Facilities + Local Admin</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-white font-bold mb-3">2. Core Responsibilities</h3>
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="font-bold text-white text-xs mb-2">Rillcod Obligations:</p>
                                    <ul className="space-y-1 text-xs">
                                        <li>• Supply world-class STEM curriculum</li>
                                        <li>• Provide LMS access for all students</li>
                                        <li>• Train and certify teaching staff</li>
                                        <li>• Technical maintenance & support</li>
                                    </ul>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="font-bold text-white text-xs mb-2">School Obligations:</p>
                                    <ul className="space-y-1 text-xs">
                                        <li>• Provide classroom/lab facilities</li>
                                        <li>• Ensure student supervision and safety</li>
                                        <li>• Promote program to parents/students</li>
                                        <li>• Maintain academic standards</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                                <Check className="w-4 h-4 text-emerald-400" /> 3. Intellectual Property
                            </h3>
                            <p>All curriculum, teaching materials, software code, and educational content remain the exclusive intellectual property of Rillcod Technologies. Use is restricted to authorized partnership programs only.</p>
                        </section>

                        <section>
                            <h3 className="text-white font-bold mb-3">4. Payments & Termination</h3>
                            <p>Fees are processed monthly. Either party may terminate the partnership with 30 days written notice. Rillcod reserves the right to terminate immediately for severe breach of standards or safety.</p>
                        </section>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-10 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/10 transition-all uppercase tracking-widest text-xs"
                    >
                        I Understand
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
        if (!form.termsAgreement) { setErr('Please accept the terms to continue'); return; }
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
            if (!res.ok) throw new Error(data.error || 'Registration failed. Please try again.');
            setSubmitted(true);
        } catch (e: any) {
            setErr(e.message ?? 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) return (
        <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center bg-white/5 border border-white/10 rounded-3xl p-10 backdrop-blur-md">
                <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Check className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-extrabold text-white mb-3">Application Received!</h2>
                <p className="text-white/50 text-sm leading-relaxed mb-8">
                    Thank you for registering <strong className="text-white">{form.schoolName || 'your school'}</strong>. Our team will review your application and contact you within <strong className="text-white">24–48 hours</strong>.
                </p>
                <button onClick={() => setSubmitted(false)}
                    className="px-6 py-3 bg-[#FF914D] hover:bg-orange-400 text-white font-bold rounded-xl transition-all text-sm">
                    Submit Another School
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0a0a14] py-16 px-4">
            <PartnershipTermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />

            {/* Background glow */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#FF914D]/6 rounded-full blur-[120px]" />
            </div>

            <div className="max-w-2xl mx-auto relative">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FF914D]/10 border border-[#FF914D]/20 rounded-full text-[#FF914D] text-xs font-bold uppercase tracking-widest mb-5">
                        <Building2 className="w-3.5 h-3.5" /> Partner School Programme
                    </div>
                    <h1 className="text-4xl font-extrabold text-white mb-3">Register Your School</h1>
                    <p className="text-white/40 text-base">Bring world-class STEM education to your students. Join 50+ partner schools across Nigeria.</p>
                </div>

                {/* Status lookup */}
                <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm shadow-2xl shadow-black/40">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-1">Check application status</p>
                            <p className="text-sm text-white/50">Enter your school email to see approval status.</p>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                            <input
                                type="email"
                                value={statusEmail}
                                onChange={(e) => setStatusEmail(e.target.value)}
                                placeholder="admin@school.edu.ng"
                                className={inputCls()}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!statusEmail) return;
                                setStatusLoading(true);
                                setStatusError('');
                                setStatusResult(null);
                                try {
                                    const res = await fetch(`/api/schools?email=${encodeURIComponent(statusEmail)}`);
                                    const json = await res.json();
                                    if (!res.ok) throw new Error(json.error || 'No registration found');
                                    setStatusResult(json.school);
                                } catch (e: any) {
                                    setStatusError(e.message ?? 'No registration found');
                                } finally {
                                    setStatusLoading(false);
                                }
                            }}
                            className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-bold rounded-xl border border-white/10 transition-all disabled:opacity-50"
                            disabled={statusLoading || !statusEmail}
                        >
                            {statusLoading ? 'Checking…' : 'Check Status'}
                        </button>
                    </div>
                    {statusError && (
                        <div className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                            {statusError}
                        </div>
                    )}
                    {statusResult && (
                        <div className="mt-3 text-xs text-white/60 bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusResult.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                statusResult.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                                    'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                }`}>
                                {statusResult.status || 'pending'}
                            </span>
                            <span>
                                {statusResult.name ? `${statusResult.name} — ` : ''}submitted {statusResult.created_at ? new Date(statusResult.created_at).toLocaleDateString() : 'recently'}.
                            </span>
                        </div>
                    )}
                </div>

                {/* Form card */}
                <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* School Info */}
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4 pb-3 border-b border-white/10">School Information</h3>
                            <div className="space-y-5">
                                <Field label="School Name *" icon={Building2}>
                                    <input type="text" name="schoolName" value={form.schoolName} onChange={set} required
                                        placeholder="e.g. Greenfield International School"
                                        className={inputCls()} />
                                </Field>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="School Type *">
                                        <select name="schoolType" value={form.schoolType} onChange={set} required className={inputCls(false) + ' appearance-none cursor-pointer'}>
                                            <option value="">Select type…</option>
                                            <option value="Primary">Primary</option>
                                            <option value="Secondary">Secondary</option>
                                            <option value="Both">Primary & Secondary</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                    </Field>
                                    <Field label="Principal / Head Teacher *">
                                        <input type="text" name="principalName" value={form.principalName} onChange={set} required
                                            placeholder="Full name"
                                            className={inputCls(false)} />
                                    </Field>
                                </div>

                                <Field label="School Address *" icon={MapPin}>
                                    <textarea name="schoolAddress" value={form.schoolAddress} onChange={set} required rows={2}
                                        placeholder="Street address…"
                                        className={inputCls() + ' resize-none'} />
                                </Field>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Field label="LGA *">
                                        <input type="text" name="lga" value={form.lga} onChange={set} required
                                            placeholder="Local Govt. Area"
                                            className={inputCls(false)} />
                                    </Field>
                                    <Field label="City">
                                        <input type="text" name="city" value={form.city} onChange={set}
                                            placeholder="City"
                                            className={inputCls(false)} />
                                    </Field>
                                    <Field label="State *">
                                        <select name="state" value={form.state} onChange={set} required className={inputCls(false) + ' appearance-none cursor-pointer'}>
                                            <option value="">Select state…</option>
                                            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                    </Field>
                                </div>
                            </div>
                        </div>

                        {/* Contact */}
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4 pb-3 border-b border-white/10">Contact Details</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Phone Number *" icon={Phone}>
                                    <input type="tel" name="schoolPhone" value={form.schoolPhone} onChange={set} required
                                        placeholder="+234 800 000 0000"
                                        className={inputCls()} />
                                </Field>
                                <Field label="Official Email *" icon={Mail}>
                                    <input type="email" name="schoolEmail" value={form.schoolEmail} onChange={set} required
                                        placeholder="admin@school.edu.ng"
                                        className={inputCls()} />
                                </Field>
                            </div>
                        </div>

                        {/* Programme */}
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4 pb-3 border-b border-white/10">Programme Preferences</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Approx. Student Count *" icon={Users}>
                                    <input type="number" name="studentCount" value={form.studentCount} onChange={set} required
                                        placeholder="e.g. 500"
                                        className={inputCls()} />
                                </Field>
                                <Field label="Programme Focus *" icon={Layers}>
                                    <select name="programInterest" value={form.programInterest} onChange={set} required className={inputCls() + ' appearance-none cursor-pointer'}>
                                        <option value="">Select…</option>
                                        <option value="Coding Fundamentals">Coding Fundamentals</option>
                                        <option value="Web Development">Web Development</option>
                                        <option value="Robotics Programming">Robotics / IoT</option>
                                        <option value="Python Programming">Python Programming</option>
                                        <option value="All Programmes">All Programmes</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                                </Field>
                            </div>
                        </div>

                        {/* Terms */}
                        <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4 border border-white/10">
                            <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set}
                                className="mt-0.5 w-4 h-4 accent-[#FF914D] cursor-pointer flex-shrink-0" />
                            <label htmlFor="terms" className="text-sm text-white/50 leading-relaxed cursor-pointer">
                                I agree to Rillcod Academy's <span onClick={() => setShowTerms(true)} className="text-[#FF914D] underline cursor-pointer">Terms of Partnership</span>. I confirm the information provided is accurate.
                            </label>
                        </div>

                        {err && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-400 text-sm">{err}</div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-[#FF914D] hover:bg-orange-400 text-white font-bold rounded-xl transition-all text-sm shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                                : <><ArrowRight className="w-4 h-4" /> Submit Partnership Application</>}
                        </button>
                    </form>
                </div>

                {/* Trust signals */}
                <div className="flex items-center justify-center gap-6 mt-8 text-xs text-white/20 font-medium">
                    <span>✓ Free to apply</span>
                    <span>✓ No commitment needed</span>
                    <span>✓ Response in 48hrs</span>
                </div>
            </div>
        </div>
    );
}
