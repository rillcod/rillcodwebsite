'use client';

import React, { useState } from 'react';
import { Building2, Check, Loader2, ChevronDown, MapPin, Phone, Mail, User, Users, Layers, ArrowRight, ShieldCheck, Scale, Globe } from 'lucide-react';

const STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

function Field({ label, icon: Icon, error, children }: { label: string; icon?: any; error?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</label>
            <div className="relative group">
                {Icon && <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors pointer-events-none z-10" />}
                {children}
            </div>
            {error && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2 ml-1">{error}</p>}
        </div>
    );
}

const inputCls = (hasIcon = true) =>
    `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-6 py-5 bg-[#121212] border border-white/10 rounded-none text-sm font-bold text-white placeholder:text-slate-800 focus:outline-none focus:border-orange-500 transition-all`;

const selectCls = (hasIcon = false) =>
    `w-full ${hasIcon ? 'pl-14' : 'pl-6'} pr-10 py-5 bg-[#121212] border border-white/10 rounded-none text-sm font-bold text-white focus:outline-none focus:border-orange-500 transition-all appearance-none cursor-pointer`;

function PartnershipTermsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-none shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 border-t-8 border-t-orange-500">
                <div className="p-8 sm:p-12 max-h-[85vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/5">
                        <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 flex items-center justify-center rounded-none">
                            <Scale className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Partnership Protocols</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Legal Framework v2.0</p>
                        </div>
                    </div>

                    <div className="space-y-10 text-slate-400 text-sm leading-relaxed">
                        <section className="space-y-4">
                            <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3">
                                <span className="text-orange-500">01.</span> REVENUE SHARE ARCHITECTURE
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                <div className="p-6 bg-[#121212] border border-white/5 rounded-none">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-[#FF914D] mb-1">Academy Nodes</p>
                                    <p className="text-3xl font-black text-white">70%</p>
                                    <p className="text-[10px] font-bold text-slate-600 mt-2 uppercase">Infrastructure & IP</p>
                                </div>
                                <div className="p-6 bg-[#121212] border border-white/5 rounded-none">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-blue-500 mb-1">Partner School</p>
                                    <p className="text-3xl font-black text-white">30%</p>
                                    <p className="text-[10px] font-bold text-slate-600 mt-2 uppercase">Facility Management</p>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3">
                                <span className="text-orange-500">02.</span> CORE OBLIGATIONS
                            </h3>
                            <div className="space-y-4">
                                <div className="p-6 bg-[#121212] border border-white/5 rounded-none border-l-4 border-l-orange-500">
                                    <p className="font-black text-white text-[10px] uppercase tracking-widest mb-4">Uplink Deliverables:</p>
                                    <ul className="space-y-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                       <li className="flex items-center gap-2">✓ PROPRIETARY STEM CURRICULUM</li>
                                       <li className="flex items-center gap-2">✓ CENTRAL LMS HUB ACCESS</li>
                                       <li className="flex items-center gap-2">✓ CADRE CERTIFICATION TRAINING</li>
                                    </ul>
                                </div>
                                <div className="p-6 bg-[#121212] border border-white/5 rounded-none border-l-4 border-l-blue-500">
                                    <p className="font-black text-white text-[10px] uppercase tracking-widest mb-4">Facility Requirements:</p>
                                    <ul className="space-y-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                       <li className="flex items-center gap-2">✓ SECURE HARDWARE LABS</li>
                                       <li className="flex items-center gap-2">✓ STUDENT CLEARANCE DATA</li>
                                       <li className="flex items-center gap-2">✓ LOCAL PROGRAMME PROMOTION</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 pt-6 border-t border-white/5">
                            <p className="italic text-xs">All intellectual assets and data streams remain the exclusive output of Rillcod Technologies. Deployment is limited to authorized nodes only.</p>
                        </section>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-10 py-6 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-none transition-all uppercase tracking-[0.4em] text-xs shadow-xl shadow-orange-500/20"
                    >
                        ACKNOWLEDGE PROTOCOLS
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
        if (!form.termsAgreement) { setErr('Protocol acceptance required'); return; }
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
            if (!res.ok) throw new Error(data.error || 'Transmission failure.');
            setSubmitted(true);
        } catch (e: any) {
            setErr(e.message ?? 'Uplink failed.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) return (
        <div className="bg-[#1a1a1a] border border-white/10 p-12 text-center shadow-2xl rounded-none border-t-4 border-t-emerald-500">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8 rounded-none">
                <Check className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-4">Submission Logged</h2>
            <p className="text-slate-400 font-bold italic mb-8">
                Request for <strong className="text-white uppercase">{form.schoolName}</strong> is now in verify state. Our audit team will contact you within 48 standard business hours.
            </p>
            <button onClick={() => setSubmitted(false)}
                className="px-10 py-5 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-orange-600 transition-all">
                Submit Another Entity
            </button>
        </div>
    );

    return (
        <div className="w-full relative py-12">
            <PartnershipTermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />

            {/* Header */}
            <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none text-orange-500 text-[10px] font-black uppercase tracking-widest mb-6">
                    <Building2 className="w-4 h-4" /> Institutional Network
                </div>
                <h1 className="text-4xl sm:text-6xl font-black text-white leading-none tracking-tight uppercase mb-4">
                   REGISTER <br />
                   <span className="text-white/40 italic">SCHOOL.</span>
                </h1>
                <p className="text-lg text-slate-400 font-medium italic max-w-lg mx-auto border-l-2 border-orange-500 pl-6 mt-8 hidden sm:block">
                   Integrate elite STEM curriculum within your campus. Join the network of 50+ high-performance nodes across West Africa.
                </p>
            </div>

            {/* Status Check Matrix */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-8 mb-8 border-l-4 border-l-blue-500">
                <div className="flex flex-col sm:flex-row items-center gap-8">
                   <div className="flex-1 text-center sm:text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#4d91ff] mb-1">Audit Check</p>
                      <h4 className="text-lg font-black text-white uppercase tracking-tight">Status Inquiry</h4>
                      <p className="text-xs text-slate-500 font-bold mt-1 uppercase italic">Check approval state for existing uplink.</p>
                   </div>
                   <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3">
                      <div className="relative">
                         <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                         <input
                             type="email" value={statusEmail} onChange={(e) => setStatusEmail(e.target.value)}
                             placeholder="admin@school.com"
                             className="bg-[#121212] border border-white/10 pl-14 pr-6 py-4 rounded-none text-sm font-bold text-white placeholder:text-slate-800 focus:outline-none focus:border-blue-500 transition-all w-full sm:w-64"
                         />
                      </div>
                      <button
                          type="button" disabled={statusLoading || !statusEmail}
                          onClick={async () => {
                              if (!statusEmail) return; setStatusLoading(true); setStatusError(''); setStatusResult(null);
                              try {
                                  const res = await fetch(`/api/schools?email=${encodeURIComponent(statusEmail)}`);
                                  const json = await res.json();
                                  if (!res.ok) throw new Error(json.error || 'Record Not Found');
                                  setStatusResult(json.school);
                              } catch (e: any) { setStatusError(e.message ?? 'Record Not Found'); }
                              finally { setStatusLoading(false); }
                          }}
                          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-none transition-all disabled:opacity-50"
                      >
                          {statusLoading ? 'AUDITING...' : 'CHECK STATUS'}
                      </button>
                   </div>
                </div>
                {statusError && <p className="mt-4 text-rose-500 text-[10px] font-black uppercase tracking-widest bg-rose-500/5 p-4 border border-rose-500/10 italic text-center">{statusError}</p>}
                {statusResult && (
                    <div className="mt-6 p-6 bg-white/5 border border-white/10 rounded-none flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-500">
                        <div className="flex items-center gap-4">
                           <div className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest border ${statusResult.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                              {statusResult.status || 'PENDING VETTING'}
                           </div>
                           <p className="text-xs font-bold text-white uppercase italic">{statusResult.name}</p>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 italic">LOGGED: {statusResult.created_at ? new Date(statusResult.created_at).toLocaleDateString() : 'N/A'}</p>
                    </div>
                )}
            </div>

            {/* Registration Matrix */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-8 md:p-12 shadow-2xl border-t-4 border-t-orange-500">
                <form onSubmit={handleSubmit} className="space-y-12">

                    <section className="space-y-8">
                        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] pb-4 border-b border-white/5 italic">DATA SEGMENT 01 // ENTITY PROFILE</h3>
                        <Field label="Legal School Name *" icon={Building2}>
                            <input type="text" name="schoolName" value={form.schoolName} onChange={set} required placeholder="AS REGISTERED WITH CAC" className={inputCls()} />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Institutional Type *">
                                <select name="schoolType" value={form.schoolType} onChange={set} required className={selectCls()}>
                                    <option value="">SELECT CLASSIFICATION</option>
                                    <option value="Primary">PRIMARY</option>
                                    <option value="Secondary">SECONDARY</option>
                                    <option value="Both">INTEGRATED (K-12)</option>
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                            </Field>
                            <Field label="Principal / Executive Head *" icon={User}>
                                <input type="text" name="principalName" value={form.principalName} onChange={set} required placeholder="FULL NAME" className={inputCls()} />
                            </Field>
                        </div>

                        <Field label="Base Address *" icon={MapPin}>
                            <input type="text" name="schoolAddress" value={form.schoolAddress} onChange={set} required placeholder="STREET ADDRESS" className={inputCls()} />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                            <Field label="LGA Sector *">
                                <input type="text" name="lga" value={form.lga} onChange={set} required placeholder="LOCAL GOVT" className={inputCls(false)} />
                            </Field>
                            <Field label="City Node">
                                <input type="text" name="city" value={form.city} onChange={set} placeholder="CITY" className={inputCls(false)} />
                            </Field>
                            <Field label="State Node *">
                                <select name="state" value={form.state} onChange={set} required className={selectCls()}>
                                    <option value="">SELECT SECTOR</option>
                                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-8 pt-8 border-t border-white/5">
                        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] pb-4 border-b border-white/5 italic">DATA SEGMENT 02 // COMMUNICATIONS</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Direct Phone Line *" icon={Phone}>
                                <input type="tel" name="schoolPhone" value={form.schoolPhone} onChange={set} required placeholder="+234..." className={inputCls()} />
                            </Field>
                            <Field label="Official Secure Email *" icon={Mail}>
                                <input type="email" name="schoolEmail" value={form.schoolEmail} onChange={set} required placeholder="ADMIN@SCHOOL.EDU.NG" className={inputCls()} />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-8 pt-8 border-t border-white/5">
                        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] pb-4 border-b border-white/5 italic">DATA SEGMENT 03 // CAPACITY</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Total Student Population *" icon={Users}>
                                <input type="number" name="studentCount" value={form.studentCount} onChange={set} required placeholder="ESTIMATED HEADCOUNT" className={inputCls()} />
                            </Field>
                            <Field label="Primary Programme Interest *" icon={Layers}>
                                <select name="programInterest" value={form.programInterest} onChange={set} required className={selectCls(true)}>
                                    <option value="">SELECT CORE MODULE</option>
                                    <option value="Coding Fundamentals">CODING FUNDAMENTALS</option>
                                    <option value="Web Development">WEB ARCHITECTURE</option>
                                    <option value="Robotics Programming">ROBOTICS / IOT</option>
                                    <option value="All Programmes">FULL STACK NETWORK</option>
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                            </Field>
                        </div>
                    </section>

                    <div className="space-y-6 pt-12">
                        <div className="flex items-start gap-4 p-6 bg-white/[0.02] border border-white/5 rounded-none">
                            <input type="checkbox" id="terms" name="termsAgreement" checked={form.termsAgreement} onChange={set} className="mt-1 w-5 h-5 accent-orange-500 cursor-pointer flex-shrink-0" />
                            <label htmlFor="terms" className="text-[11px] font-bold text-slate-500 leading-relaxed cursor-pointer italic">
                                I confirm all institutional records for <span className="text-white uppercase">{form.schoolName || 'This Entity'}</span> are accurate. I agree to the <span onClick={(e) => { e.preventDefault(); setShowTerms(true); }} className="text-orange-500 underline cursor-pointer font-black">Partnership Protocols</span> and operational framework.
                            </label>
                        </div>

                        {err && (
                            <div className="bg-rose-500/5 border border-rose-500/10 p-6 text-rose-500 text-[10px] font-black uppercase tracking-widest italic text-center">{err}</div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full flex items-center justify-center gap-6 py-8 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.5em] rounded-none hover:bg-orange-600 transition-all shadow-2xl shadow-orange-500/20 disabled:opacity-50 hover:scale-[1.01] active:scale-95">
                            {loading
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> EXECUTING UPLINK...</>
                                : <><ArrowRight className="w-5 h-5" /> INITIALIZE PARTNERSHIP APPLICATION</>}
                        </button>
                    </div>
                </form>
            </div>

            {/* Verification Nodes */}
            <div className="flex flex-wrap items-center justify-center gap-8 mt-16 opacity-30">
                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-white">
                   <ShieldCheck className="w-3 h-3 text-orange-500" /> SECURE UPLINK VERIFIED
                </div>
                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-white">
                   <Globe className="w-3 h-3 text-blue-500" /> REGIONAL NODE ACTIVE
                </div>
                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-white">
                   <Users className="w-3 h-3 text-emerald-500" /> 50+ PARTNER ENTITIES
                </div>
            </div>
        </div>
    );
}
