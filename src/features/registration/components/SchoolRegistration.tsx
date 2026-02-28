'use client';

import React, { useState } from 'react';
import { Building2, Check, Loader2, ChevronDown, MapPin, Phone, Mail, Users, Layers, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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

export function SchoolRegistration() {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [err, setErr] = useState('');

    const [form, setForm] = useState({
        schoolName: '', schoolType: '', principalName: '',
        schoolAddress: '', lga: '', state: '',
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
            const { error } = await createClient().from('schools').insert([{
                name: form.schoolName, school_type: form.schoolType,
                contact_person: form.principalName, address: form.schoolAddress,
                lga: form.lga, state: form.state,
                phone: form.schoolPhone, email: form.schoolEmail,
                student_count: parseInt(form.studentCount) || 0,
                program_interest: [form.programInterest],
            }]);
            if (error) throw error;
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="LGA *">
                                        <input type="text" name="lga" value={form.lga} onChange={set} required
                                            placeholder="Local Govt. Area"
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
                                I agree to Rillcod Academy's <span className="text-[#FF914D] underline cursor-pointer">Terms of Partnership</span>. I confirm the information provided is accurate.
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
