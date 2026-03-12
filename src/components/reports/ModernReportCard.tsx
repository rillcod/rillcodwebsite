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
          className="bg-white text-gray-900 font-sans relative overflow-hidden flex flex-col p-10"
          style={{ width: 794, height: 1123, margin: '0 auto', fontSize: 13, border: '1px solid #f1f5f9', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
            {/* Ambient Background Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/5 blur-[120px] rounded-full -ml-40 -mb-40 pointer-events-none" />
            <div className="absolute inset-0 border border-black/5 m-8 pointer-events-none rounded-[3rem]" />

            {/* HEADER SECTION */}
            <div className="relative z-10 flex justify-between items-center mb-5 pb-5 border-b border-gray-100">
                <div className="flex items-center gap-4">
                    <img 
                      src={orgSettings?.logo_url || '/logo.png'} 
                      alt="Logo" 
                      className="w-12 h-12 object-contain"
                    />
                    <div>
                        <h2 className="text-[7px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-0.5 opacity-80">Official Academic Transcript</h2>
                        <h1 className="text-lg font-black uppercase tracking-tight leading-none italic">
                             {orgSettings?.org_name || 'Rillcod Academy'}
                        </h1>
                        <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{orgSettings?.org_tagline || 'Excellence in Technology'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-5">
                    {hasPayment && feeStyle && (
                        <div className="text-right hidden sm:block">
                            <p className="text-[7px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1">Fee Status</p>
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black border tracking-wider bg-white"
                                style={{ color: feeStyle.text, borderColor: `${feeStyle.text}30` }}>
                                {feeStyle.label}
                            </span>
                        </div>
                    )}
                    <div className="h-8 w-px bg-gray-100 hidden sm:block" />
                    <div className="text-right">
                        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-0.5">Reference</p>
                        <p className="text-base font-black text-gray-900 tabular-nums leading-none tracking-tighter italic">{report.id?.slice(0, 8) || 'PREVIEW'}</p>
                    </div>
                </div>
            </div>

            {/* IDENTITY GRID */}
            <div className="grid grid-cols-2 gap-4 mb-5 relative z-10">
                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 relative overflow-hidden">
                    <p className="text-[7px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1.5 opacity-60">Student Profile</p>
                    <div className="space-y-2">
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tighter leading-tight truncate">{report.student_name || '—'}</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-[6px] font-black text-gray-300 uppercase tracking-widest mb-0.5">Academic Level</p>
                                <p className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap overflow-hidden text-ellipsis">{report.section_class || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[6px] font-black text-gray-300 uppercase tracking-widest mb-0.5">Institution</p>
                                <p className="text-[10px] font-bold text-gray-600 uppercase truncate">{report.school_name || 'Rillcod'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 relative overflow-hidden">
                    <p className="text-[7px] font-black text-cyan-500 uppercase tracking-[0.2em] mb-1.5 opacity-60">Academic Details</p>
                    <div className="space-y-2">
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tighter leading-tight truncate">{report.course_name || '—'}</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-[6px] font-black text-gray-300 uppercase tracking-widest mb-0.5">Term/Duration</p>
                                <p className="text-[10px] font-bold text-gray-600 uppercase truncate">{report.report_term || report.course_duration || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[6px] font-black text-gray-300 uppercase tracking-widest mb-0.5">Date Issued</p>
                                <p className="text-[10px] font-bold text-gray-600 uppercase">{today}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN METRIC HUB */}
            <div className="relative z-10 flex flex-col gap-4 mb-5">
                <div className="text-center">
                    <p className="text-[9px] font-black text-indigo-500/50 uppercase tracking-[0.5em] mb-1 leading-none">Intelligence Metrics Hub</p>
                    <div className="h-px w-12 bg-indigo-500/20 mx-auto rounded-full" />
                </div>

                <div className="grid grid-cols-12 gap-4 items-stretch min-h-0">
                   {/* Qualitative Bars */}
                   <div className="col-span-7 bg-gray-50/50 border border-gray-100 rounded-2xl p-5 flex flex-col justify-between items-stretch">
                      <div className="space-y-4">
                         {[
                           { label: 'Theory Protocols', value: theory, color: 'rgb(79, 70, 229)', icon: AcademicCapIcon },
                           { label: 'Practical Hub', value: practical, color: 'rgb(6, 182, 212)', icon: BoltIcon },
                           { label: 'Presence Data', value: attendance, color: 'rgb(16, 185, 129)', icon: ClockIcon },
                           { label: 'Engagement', value: report.participation_score || 0, color: 'rgb(139, 92, 246)', icon: UserGroupIcon }
                         ].map(m => (
                           <div key={m.label} className="space-y-1">
                             <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest leading-none">
                                <span className="text-gray-400 flex items-center gap-2"><m.icon className="w-3 h-3 text-black/5" /> {m.label}</span>
                                <span style={{ color: m.color }}>{m.value}%</span>
                             </div>
                             <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${m.value}%`, backgroundColor: m.color }} />
                             </div>
                           </div>
                         ))}
                         <div className="grid grid-cols-2 gap-3 pt-3 border-t border-black/5 mt-auto">
                            {[
                                { l: 'Project', v: report.projects_grade },
                                { l: 'Homework', v: report.homework_grade }
                            ].map(g => (
                                <div key={g.l} className="bg-white border border-black/5 px-3 py-2 rounded-xl">
                                    <p className="text-[6px] font-black text-gray-300 uppercase tracking-widest mb-0.5">{g.l}</p>
                                    <p className="text-sm font-black text-gray-900 leading-none italic">{g.v || '—'}</p>
                                </div>
                            ))}
                         </div>
                      </div>
                   </div>

                   {/* Master Grade */}
                   <div className="col-span-5 bg-indigo-50/20 border border-indigo-100/30 rounded-2xl p-5 flex flex-col items-center justify-center text-center overflow-hidden">
                        <TrophyIcon className="w-5 h-5 text-amber-500/40 mb-2" />
                        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 opacity-60">Master Grade</p>
                        <h3 className="text-6xl font-black leading-none italic" style={{ color: grade.color }}>{grade.g}</h3>
                        <div className="mt-3 px-3 py-1 bg-white border border-indigo-50 rounded-lg inline-block shadow-sm">
                           <span className="text-[9px] font-black uppercase tracking-widest text-gray-700 italic">{grade.label}</span>
                        </div>
                        <p className="text-lg font-black text-gray-200 mt-3 tabular-nums tracking-tighter italic">{overall}% ACC</p>
                   </div>
                </div>
            </div>

            {/* MODULES & EVALUATION */}
            <div className="grid grid-cols-12 gap-5 mb-4 relative z-10">
                <div className="col-span-4 space-y-2">
                    <div className="bg-gray-50 border-l-4 border-indigo-500/30 p-4 rounded-xl">
                        <p className="text-[7px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-2">
                           <CheckBadgeIcon className="w-2.5 h-2.5 text-indigo-600" /> Current Module
                        </p>
                        <p className="text-[11px] font-black text-gray-900/70 leading-tight uppercase tracking-tight italic">{report.current_module || 'Synthetic Core'}</p>
                    </div>
                    <div className="bg-gray-50 border-l-4 border-cyan-500/30 p-4 rounded-xl">
                        <p className="text-[7px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-2">
                           <BoltIcon className="w-2.5 h-2.5 text-cyan-600" /> Next Evolution
                        </p>
                        <p className="text-[11px] font-black text-gray-900/70 leading-tight uppercase tracking-tight italic">{report.next_module || 'Advanced Node'}</p>
                    </div>
                </div>

                <div className="col-span-8 grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 border border-emerald-500/10 p-5 rounded-[1.25rem] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-2xl -mr-10 -mt-10" />
                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2 italic">
                           <SparklesIcon className="w-3 h-3" /> Sector Strengths
                        </p>
                        <p className="text-[11px] leading-relaxed text-gray-700 font-medium text-justify line-clamp-4">
                           {report.key_strengths || 'Cognitive patterns indicate high analytical precision and rapid assimilation of core technical logic.'}
                        </p>
                    </div>
                    <div className="bg-gray-50 border border-rose-500/10 p-5 rounded-[1.25rem] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 blur-2xl -mr-10 -mt-10" />
                        <p className="text-[8px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-2 italic">
                           <SparklesIcon className="w-3 h-3" /> Differential Focus
                        </p>
                        <p className="text-[11px] leading-relaxed text-gray-700 font-medium text-justify line-clamp-4">
                           {report.areas_for_growth || 'Transition to complex architectural modeling is required to optimize large-scale deployment competence.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* CERTIFICATE BANNER */}
            {(overall >= 45 || report.has_certificate) && (
                <div className="relative z-10 mb-4 bg-indigo-50 border border-indigo-100 rounded-[1.5rem] p-6 flex flex-col items-center text-center overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/[0.03] blur-[60px] -mr-16 -mt-16" />
                    <div className="absolute left-0 bottom-0 w-32 h-32 bg-cyan-500/[0.03] blur-[60px] -ml-16 -mb-16" />
                    <TrophyIcon className="w-8 h-8 text-indigo-600 mb-2 opacity-30" />
                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.4em] mb-2">Official Validation Decree</h4>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] max-w-lg leading-relaxed italic">
                        {report.certificate_text || `This record confirms that ${report.student_name} has successfully synthesized all required protocols within the ${report.course_name} curriculum.`}
                    </p>
                </div>
            )}

            {/* SIGNATURE & AUTHENTICATION */}
            <div className="mt-auto relative z-10">
                <div className="flex items-end justify-between border-t border-black/5 pt-6 px-4">
                    <div className="flex flex-col gap-4">
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-2 italic">Validation Matrix</p>
                            <div className="flex items-center gap-8">
                               <div className="text-center">
                                  <img 
                                    src="/images/signature.png" 
                                    alt="Sign" 
                                    className="h-12 w-auto object-contain brightness-0 opacity-60 mb-1 mx-auto"
                                  />
                                  <div className="w-32 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent mb-1.5" />
                                  <p className="text-[10px] font-black text-gray-900/80 uppercase tracking-widest italic">{report.instructor_name || 'Osahon'}</p>
                                  <p className="text-[7px] font-black text-gray-300 uppercase tracking-[0.2em]">Authority Directive</p>
                               </div>
                               <div className="hidden sm:block w-px h-20 bg-black/5" />
                               {report.show_payment_notice && (
                                 <div className="hidden sm:flex flex-col gap-1 items-start justify-center pr-6 border-l border-black/5 pl-6">
                                    <p className="text-[8px] font-black text-indigo-600/50 uppercase tracking-[0.3em] leading-none mb-1 text-right w-full">Next Cycle Ledger</p>
                                    <p className="text-base font-black text-gray-900/80 tabular-nums italic leading-none text-right w-full">₦20,000</p>
                                    <p className="text-[10px] font-black text-gray-900/80 uppercase tracking-widest leading-none mt-1 text-right w-full">RILLCOD LTD</p>
                                    <p className="text-[8px] font-extrabold text-gray-400 tracking-wider leading-none text-right w-full">Providus Bank · 7901178957</p>
                                 </div>
                               )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <div className="p-5 bg-white rounded-3xl shadow-xl ring-8 ring-black/[0.02]">
                            <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={80} />
                        </div>
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] italic leading-none">Secure Link</p>
                    </div>
                </div>

                <div className="mt-12 flex items-center justify-between text-[8px] font-black text-black/10 uppercase tracking-[0.5em] pb-2">
                    <span>Generated by Nucleus Engine v2.4</span>
                    <div className="flex gap-4">
                        <span>Binary Hash: {report.id?.slice(-12).toUpperCase() || 'DATA_PREVIEW_NULL'}</span>
                        <span>rillcod.com/verify</span>
                    </div>
                </div>
            </div>

            {/* Footer Stripes */}
            <div className="absolute bottom-0 inset-x-0 h-1 flex">
               <div className="flex-1 bg-indigo-500/50" />
               <div className="flex-1 bg-cyan-500/50" />
               <div className="flex-1 bg-emerald-500/50" />
            </div>
        </div>
    );
}
