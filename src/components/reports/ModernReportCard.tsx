// @refresh reset
'use client';

import React from 'react';
import QRCode from 'react-qr-code';
import { 
  TrophyIcon, 
  AcademicCapIcon, 
  UserCircleIcon, 
  BoltIcon, 
  SparklesIcon,
  CheckBadgeIcon,
  ClockIcon,
  CalendarDaysIcon,
  UserGroupIcon
} from '@heroicons/react/24/solid';

export interface ReportCardData {
    id?: string | null;
    student_name?: string | null;
    school_name?: string | null;
    course_name?: string | null;
    section_class?: string | null;
    report_term?: string | null;
    report_date?: string | null;
    theory_score?: number | null;
    practical_score?: number | null;
    attendance_score?: number | null;
    overall_score?: number | null;
    photo_url?: string | null;
    key_strengths?: string | null;
    areas_for_growth?: string | null;
    has_certificate?: boolean | null;
    certificate_text?: string | null;
    instructor_name?: string | null;
    participation_grade?: string | null;
    projects_grade?: string | null;
    homework_grade?: string | null;
    current_module?: string | null;
    next_module?: string | null;
    learning_milestones?: string[] | null;
    course_duration?: string | null;
    report_period?: string | null;
    is_published?: boolean | null;
    school_section?: string | null;
    fee_label?: string | null;
    fee_amount?: string | null;
    fee_status?: string | null;
    show_payment_notice?: boolean | null;
    participation_score?: number | null;
    engagement_metrics?: any | null;
}

export interface OrgSettings {
    org_name?: string | null;
    org_tagline?: string | null;
    org_address?: string | null;
    org_phone?: string | null;
    org_email?: string | null;
    logo_url?: string | null;
}

const FEE_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    paid:        { bg: '#d1fae5', text: '#065f46', label: 'PAID' },
    outstanding: { bg: '#fee2e2', text: '#991b1b', label: 'OUTSTANDING' },
    partial:     { bg: '#fef3c7', text: '#92400e', label: 'PARTIAL PAYMENT' },
    sponsored:   { bg: '#dbeafe', text: '#1e40af', label: 'SPONSORED' },
    waived:      { bg: '#ede9fe', text: '#5b21b6', label: 'WAIVED' },
};

function letterGrade(pct: number) {
    if (pct >= 85) return { g: 'A', label: 'EXCELLENT', color: '#059669' };
    if (pct >= 70) return { g: 'B', label: 'VERY GOOD', color: '#4f46e5' };
    if (pct >= 55) return { g: 'C', label: 'GOOD', color: '#d97706' };
    if (pct >= 45) return { g: 'D', label: 'PASS', color: '#7c3aed' };
    return { g: 'E', label: 'FAIL', color: '#e11d48' };
}

export default function ModernReportCard({ report, orgSettings }: {
    report: ReportCardData;
    orgSettings: OrgSettings | null;
}) {
    const today = report.report_date
        ? new Date(report.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    const theory = Number(report.theory_score) || 0;
    const practical = Number(report.practical_score) || 0;
    const attendance = Number(report.attendance_score) || 0;
    const computed = Math.round(theory * 0.4 + practical * 0.4 + attendance * 0.2);
    const overall = Number(report.overall_score) > 0 ? Number(report.overall_score) : computed;
    const grade = letterGrade(overall);

    const hasPayment = !!report.fee_status;
    const feeStyle = report.fee_status ? FEE_STATUS_STYLE[report.fee_status] : null;

    return (
        <div 
          id="modern-report-card"
          className="bg-white text-gray-900 font-sans relative overflow-hidden flex flex-col p-12"
          style={{ width: 794, height: 1123, margin: '0 auto', fontSize: 13, border: '1px solid #f1f5f9', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
            {/* Ambient Background Elements */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 blur-[150px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full -ml-40 -mb-40 pointer-events-none" />
            <div className="absolute inset-0 border-2 border-indigo-500/5 m-6 pointer-events-none rounded-[3.5rem]" />

            {/* HEADER SECTION */}
            <div className="relative z-10 flex justify-between items-center mb-6 pb-6 border-b border-gray-100">
                <div className="flex items-center gap-6">
                    <div className="p-3 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-50">
                        <img 
                          src={orgSettings?.logo_url || '/logo.png'} 
                          alt="Logo" 
                          className="w-12 h-12 object-contain"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
                            <h2 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] opacity-70">Official Academic Registry</h2>
                        </div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter leading-none italic bg-gradient-to-r from-gray-900 to-gray-500 bg-clip-text text-transparent">
                             {orgSettings?.org_name || 'Rillcod Academy'}
                        </h1>
                        <p className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-1.5">{orgSettings?.org_tagline || 'Excellence in Technology'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    {hasPayment && feeStyle && (
                        <div className="text-right">
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1.5">Fee Status</p>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black border tracking-wider bg-white shadow-sm"
                                style={{ color: feeStyle.text, borderColor: `${feeStyle.text}30` }}>
                                {feeStyle.label}
                            </span>
                        </div>
                    )}
                    <div className="h-10 w-px bg-gradient-to-b from-transparent via-gray-100 to-transparent" />
                    <div className="text-right">
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Transcript ID</p>
                        <p className="text-xl font-black text-gray-900 tabular-nums leading-none tracking-tighter italic">{report.id?.slice(0, 8) || 'PREVIEW'}</p>
                    </div>
                </div>
            </div>

            {/* IDENTITY GRID */}
            <div className="grid grid-cols-2 gap-6 mb-6 relative z-10">
                <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-[2rem] p-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-3 opacity-60 flex items-center gap-2">
                        <UserCircleIcon className="w-3 h-3" /> Candidate Profile
                    </p>
                    <div className="space-y-4">
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-tight truncate">{report.student_name || '—'}</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Academic Level</p>
                                <p className="text-[12px] font-bold text-gray-600 uppercase italic truncate">{report.section_class || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Institution</p>
                                <p className="text-[12px] font-bold text-gray-600 uppercase italic truncate">{report.school_name || 'Rillcod'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-[2rem] p-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
                    <p className="text-[9px] font-black text-cyan-500 uppercase tracking-[0.3em] mb-3 opacity-60 flex items-center gap-2">
                        <AcademicCapIcon className="w-3 h-3" /> Operational Details
                    </p>
                    <div className="space-y-4">
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-tight truncate">{report.course_name || '—'}</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Term/Duration</p>
                                <p className="text-[12px] font-bold text-gray-600 uppercase italic truncate">{report.report_term || report.course_duration || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Session Closing</p>
                                <p className="text-[12px] font-bold text-gray-600 uppercase italic truncate">{today}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN METRIC HUB */}
            <div className="relative z-10 flex flex-col gap-5 mb-6">
                <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
                    <p className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.6em] leading-none italic">Intelligence Matrix</p>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
                </div>

                <div className="grid grid-cols-12 gap-6 items-stretch">
                   {/* Qualitative Bars */}
                   <div className="col-span-7 bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between">
                      <div className="space-y-6">
                         {[
                           { label: 'Theory Protocols', value: theory, color: 'rgb(79, 70, 229)', icon: AcademicCapIcon, glow: 'rgba(79, 70, 229, 0.2)' },
                           { label: 'Practical Synthesis', value: practical, color: 'rgb(6, 182, 212)', icon: BoltIcon, glow: 'rgba(6, 182, 212, 0.2)' },
                           { label: 'Presence Metric', value: attendance, color: 'rgb(16, 185, 129)', icon: ClockIcon, glow: 'rgba(16, 185, 129, 0.2)' },
                           { label: 'Engagement Data', value: report.participation_score || 0, color: 'rgb(139, 92, 246)', icon: UserGroupIcon, glow: 'rgba(139, 92, 246, 0.2)' }
                         ].map(m => (
                           <div key={m.label} className="space-y-2">
                             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                <span className="text-gray-400 flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
                                        <m.icon className="w-3 h-3 text-gray-400" />
                                    </div>
                                    {m.label}
                                </span>
                                <span style={{ color: m.color }} className="italic text-xs">{m.value}%</span>
                             </div>
                             <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100/50">
                                <div className="h-full rounded-full transition-all duration-1000 relative" 
                                     style={{ width: `${m.value}%`, backgroundColor: m.color, boxShadow: `0 0 10px ${m.glow}` }}>
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-50" />
                                </div>
                             </div>
                           </div>
                         ))}
                         <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-50 mt-2">
                            {[
                                { l: 'Project Grade', v: report.projects_grade, c: 'violet' },
                                { l: 'Homework Hub', v: report.homework_grade, c: 'cyan' }
                            ].map(g => (
                                <div key={g.l} className="bg-gray-50/50 border border-gray-100 px-4 py-3 rounded-2xl group hover:border-indigo-500/20 transition-colors">
                                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1.5">{g.l}</p>
                                    <p className="text-lg font-black text-gray-900 leading-none italic">{g.v || '—'}</p>
                                </div>
                            ))}
                         </div>
                      </div>
                   </div>

                   {/* Master Grade */}
                   <div className="col-span-5 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-100/30 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-sm">
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] opacity-20" />
                        <div className="relative z-10">
                            <div className="p-4 rounded-3xl bg-white shadow-2xl mb-4 border border-indigo-50/50 group-hover:scale-110 transition-transform duration-700">
                                <TrophyIcon className="w-8 h-8 text-amber-500" />
                            </div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-2 italic">Composite Standing</p>
                            <h3 className="text-8xl font-black leading-none italic drop-shadow-sm transition-all" style={{ color: grade.color }}>{grade.g}</h3>
                            <div className="mt-6 px-5 py-2 bg-white border border-indigo-50 rounded-2xl inline-block shadow-xl">
                               <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-800 italic">{grade.label}</span>
                            </div>
                            <p className="text-2xl font-black text-gray-200 mt-6 tabular-nums tracking-tighter italic opacity-40">{overall}% ACCURACY</p>
                        </div>
                   </div>
                </div>
            </div>

            {/* MODULES & EVALUATION */}
            <div className="grid grid-cols-12 gap-6 mb-6 relative z-10">
                <div className="col-span-4 space-y-3">
                    <div className="bg-gradient-to-br from-indigo-50 to-white border-l-4 border-indigo-500 p-5 rounded-2xl shadow-sm">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                           <CheckBadgeIcon className="w-3 h-3" /> Active Operative
                        </p>
                        <p className="text-[13px] font-black text-gray-900/80 leading-tight uppercase tracking-tight italic truncate">{report.current_module || 'Synthetic Core'}</p>
                    </div>
                    <div className="bg-gradient-to-br from-cyan-50 to-white border-l-4 border-cyan-500 p-5 rounded-2xl shadow-sm">
                        <p className="text-[8px] font-black text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                           <BoltIcon className="w-3 h-3" /> Sequence Target
                        </p>
                        <p className="text-[13px] font-black text-gray-900/80 leading-tight uppercase tracking-tight italic truncate">{report.next_module || 'Advanced Node'}</p>
                    </div>
                </div>

                <div className="col-span-8 grid grid-cols-2 gap-4">
                    <div className="bg-white border border-emerald-500/10 p-6 rounded-[2rem] relative shadow-sm hover:border-emerald-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 italic">
                                <SparklesIcon className="w-3.5 h-3.5" /> High Precision Strengths
                            </p>
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <p className="text-[13px] leading-[1.6] text-gray-700 font-medium line-clamp-4 italic">
                           {report.key_strengths || 'Cognitive patterns indicate high analytical precision and rapid assimilation of core technical logic.'}
                        </p>
                    </div>
                    <div className="bg-white border border-rose-500/10 p-6 rounded-[2rem] relative shadow-sm hover:border-rose-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-2 italic">
                                <BoltIcon className="w-3.5 h-3.5" /> Growth Vectors
                            </p>
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        </div>
                        <p className="text-[13px] leading-[1.6] text-gray-700 font-medium line-clamp-4 italic">
                           {report.areas_for_growth || 'Transition to complex architectural modeling is required to optimize large-scale deployment competence.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* VALIDATION DECREE */}
            {(overall >= 45 || report.has_certificate) && (
                <div className="relative z-10 mb-6 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] p-8 flex flex-col items-center text-center overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[80px] -mr-32 -mt-32" />
                    <div className="absolute left-0 bottom-0 w-64 h-64 bg-cyan-400/10 blur-[80px] -ml-32 -mb-32" />
                    <TrophyIcon className="w-10 h-10 text-white/20 mb-3" />
                    <h4 className="text-[11px] font-black text-white uppercase tracking-[0.5em] mb-3">Official Certification Decree</h4>
                    <p className="text-[12px] font-bold text-white/70 uppercase tracking-[0.1em] max-w-2xl leading-relaxed italic">
                        {report.certificate_text || `This document validates that ${report.student_name} has demonstrated technical proficiency and successfully synthesized all required protocols within the ${report.course_name} curriculum.`}
                    </p>
                </div>
            )}

            {/* SIGNATURE & AUTHENTICATION */}
            <div className="mt-auto relative z-10 bg-gray-50/50 border border-gray-100 rounded-[2.5rem] p-8">
                <div className="flex items-end justify-between px-4">
                    <div className="flex flex-col gap-6">
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-indigo-500/40 uppercase tracking-[0.4em] italic mb-4">Board Verification Matrix</p>
                            <div className="flex items-center gap-10">
                               <div className="text-center">
                                  <img 
                                    src="/images/signature.png" 
                                    alt="Sign" 
                                    className="h-14 w-auto object-contain brightness-0 opacity-80 mb-2 mx-auto filter drop-shadow-lg"
                                  />
                                  <div className="w-40 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-2" />
                                  <p className="text-[13px] font-black text-gray-900 uppercase tracking-widest italic leading-none">{report.instructor_name || 'Rillcod Executive'}</p>
                                  <p className="text-[9px] font-black text-indigo-500/30 uppercase tracking-[0.3em] mt-1.5">Lead Operative Directive</p>
                               </div>
                               <div className="w-px h-24 bg-gray-200" />
                               {report.show_payment_notice && (
                                 <div className="flex flex-col gap-1.5 items-start justify-center pr-10 border-l border-gray-100 pl-10">
                                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.4em] leading-none mb-2">Cycle Ledger</p>
                                    <p className="text-2xl font-black text-gray-900 tabular-nums italic leading-none">₦20,000</p>
                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mt-1">RILLCOD LTD · TRUSTED</p>
                                    <p className="text-[9px] font-black text-indigo-500/40 tracking-widest leading-none mt-1 uppercase italic">Providus Bank · 7901178957</p>
                                 </div>
                               )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <div className="p-6 bg-white rounded-[2rem] shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-gray-50 group hover:rotate-3 transition-transform duration-500">
                            <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={90} fgColor="#1e1b4b" />
                        </div>
                        <div className="flex flex-col items-center">
                            <p className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.5em] italic leading-none">Secure Link</p>
                            <div className="w-8 h-px bg-indigo-500/20 mt-2" />
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex items-center justify-between text-[9px] font-black text-gray-300 uppercase tracking-[0.5em] pb-2 border-t border-gray-100 pt-6">
                    <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/30" />
                        Nucleus Engine v2.5 Deployment Ready
                    </span>
                    <div className="flex gap-6">
                        <span>Binary Hash: {report.id?.slice(-12).toUpperCase() || 'DATA_PREVIEW_NULL'}</span>
                        <span className="text-indigo-400/40">rillcod.com/verify</span>
                    </div>
                </div>
            </div>
            {/* Footer Stripes */}
            <div className="absolute bottom-0 inset-x-0 h-2 flex">
               <div className="flex-1 bg-indigo-500" />
               <div className="flex-1 bg-cyan-500" />
               <div className="flex-1 bg-emerald-500" />
               <div className="flex-1 bg-violet-500" />
               <div className="flex-1 bg-rose-500" />
            </div>
        </div>
    );
}
