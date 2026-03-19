'use client';

import React from 'react';
import QRCode from 'react-qr-code';
import { 
    UserCircleIcon, 
    AcademicCapIcon, 
    BoltIcon, 
    ClockIcon, 
    UserGroupIcon, 
    TrophyIcon, 
    SparklesIcon, 
    CheckBadgeIcon 
} from '@/lib/icons';

interface PrintableReportProps {
    report: any;
    orgSettings?: any;
}

/**
 * A dedicated component for high-fidelity printing and PDF generation.
 * This component (and its children) use fixed pixel values (794px x 1123px)
 * and @media print rules to ensure absolute parity between screen and paper.
 */
export default function PrintableReport({ report, orgSettings }: PrintableReportProps) {
    if (!report) return null;

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const overall = report.overall_score || 0;
    const theory = report.theory_score || 0;
    const practical = report.practical_score || 0;
    const attendance = report.attendance_score || 0;

    const getGrade = (score: number) => {
        if (score >= 90) return { g: 'A+', label: 'Distinction', color: '#10b981' };
        if (score >= 80) return { g: 'A', label: 'Excellent', color: '#10b981' };
        if (score >= 70) return { g: 'B', label: 'Great', color: '#3b82f6' };
        if (score >= 60) return { g: 'C', label: 'Good', color: '#f59e0b' };
        return { g: 'D', label: 'Needs Improvement', color: '#ef4444' };
    };
    const grade = getGrade(overall);

    const hasPayment = report.fee_status && report.fee_status !== 'none';
    const getFeeStyle = (status: string) => {
        if (status === 'full') return { label: 'Paid in Full', text: '#059669', bg: '#ecfdf5' };
        if (status === 'partial') return { label: 'Partial Payment', text: '#d97706', bg: '#fffbeb' };
        return null;
    };
    const feeStyle = hasPayment ? getFeeStyle(report.fee_status) : null;

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .printable-card {
                        box-shadow: none !important;
                        border: none !important;
                        width: 794px !important;
                        height: 1123px !important;
                    }
                }
            ` }} />

            <div
                className="printable-card bg-white text-gray-900 font-sans relative overflow-hidden flex flex-col p-10 mx-auto shadow-2xl"
                style={{ 
                    width: '794px', 
                    height: '1123px', 
                    maxHeight: '1123px',
                    fontSize: '12.5px', 
                    WebkitPrintColorAdjust: 'exact', 
                    printColorAdjust: 'exact',
                    boxSizing: 'border-box'
                }}
            >
                {/* Ambient Background Elements */}
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/5 blur-[100px] rounded-full -mr-20 -mt-20 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/5 blur-[100px] rounded-full -ml-20 -mb-20 pointer-events-none" />
                <div className="absolute inset-0 border-2 border-indigo-500/5 m-6 pointer-events-none rounded-[3.5rem]" />

                {/* HEADER SECTION */}
                <div className="relative z-10 flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-50">
                            <img 
                              src={orgSettings?.logo_url || '/logo.png'} 
                              alt="Logo" 
                              crossOrigin="anonymous"
                              className="w-12 h-12 object-contain"
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                <h2 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] opacity-70">Official Academic Registry</h2>
                            </div>
                            <h1 className="text-2xl font-black uppercase tracking-tighter leading-none italic bg-gradient-to-r from-gray-900 to-gray-500 bg-clip-text text-transparent">
                                {orgSettings?.org_name || 'Rillcod Technologies'}
                            </h1>
                            <p className="text-[7.5px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-1">{orgSettings?.org_tagline || 'Excellence in Technology'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-8">
                        {hasPayment && feeStyle && (
                            <div className="text-right">
                                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1.5">Fee Status</p>
                                <span className="px-3 py-1 rounded-full text-[9px] font-black border tracking-wider bg-white shadow-sm"
                                    style={{ color: feeStyle.text, borderColor: `${feeStyle.text}30` }}>
                                    {feeStyle.label}
                                </span>
                            </div>
                        )}
                        <div className="text-right">
                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Transcript ID</p>
                            <p className="text-xl font-black text-gray-900 tabular-nums leading-none tracking-tighter italic">{report.id?.slice(0, 8) || 'PREVIEW'}</p>
                        </div>
                    </div>
                </div>

                {/* IDENTITY GRID */}
                <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
                    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-[2rem] p-5 shadow-sm relative overflow-hidden group">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-3 opacity-60 flex items-center gap-2">
                            <UserCircleIcon className="w-3.5 h-3.5" /> Candidate Profile
                        </p>
                        <div className="space-y-4">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-tight">{report.student_name || '—'}</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Academic Level</p>
                                    <p className="text-[11px] font-bold text-gray-600 uppercase italic truncate">{report.section_class || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Institution</p>
                                    <p className="text-[11px] font-bold text-gray-600 uppercase italic truncate">{report.school_name || 'Rillcod'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-[2rem] p-5 shadow-sm relative overflow-hidden group">
                        <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] mb-3 opacity-60 flex items-center gap-2">
                            <AcademicCapIcon className="w-3.5 h-3.5" /> Operational Details
                        </p>
                        <div className="space-y-4">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-tight">{report.course_name || '—'}</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Term/Duration</p>
                                    <p className="text-[11px] font-bold text-gray-600 uppercase italic truncate">{report.report_term || report.course_duration || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1">Session Closing</p>
                                    <p className="text-[11px] font-bold text-gray-600 uppercase italic truncate">{today}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MAIN METRIC HUB */}
                <div className="relative z-10 flex flex-col gap-3 mb-4">
                    <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
                        <p className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.6em] leading-none italic">Intelligence Matrix</p>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
                    </div>

                    <div className="grid grid-cols-12 gap-6 items-stretch">
                        <div className="col-span-8 bg-white border border-gray-100 rounded-[2rem] p-6 flex flex-col justify-between">
                            <div className="space-y-4">
                                {[
                                    { label: 'Theory Protocols', value: theory, color: '#4f46e5', icon: AcademicCapIcon },
                                    { label: 'Practical Synthesis', value: practical, color: '#0891b2', icon: BoltIcon },
                                    { label: 'Presence Metric', value: attendance, color: '#059669', icon: ClockIcon },
                                    { label: 'Engagement Data', value: report.participation_score || 0, color: '#7c3aed', icon: UserGroupIcon }
                                ].map(m => (
                                    <div key={m.label} className="space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-gray-400 flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100/50">
                                                    <m.icon className="w-3 h-3 text-gray-400" />
                                                </div>
                                                {m.label}
                                            </span>
                                            <span style={{ color: m.color }} className="italic text-base font-bold">{m.value}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100/30">
                                            <div className="h-full rounded-full" style={{ width: `${m.value}%`, backgroundColor: m.color }} />
                                        </div>
                                    </div>
                                ))}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 mt-2">
                                    {[
                                        { l: 'Project Grade', v: report.projects_grade },
                                        { l: 'Homework Hub', v: report.homework_grade }
                                    ].map(g => (
                                        <div key={g.l} className="bg-gray-50/20 border border-gray-100 px-4 py-3 rounded-2xl">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">{g.l}</p>
                                            <p className="text-lg font-black text-gray-900 leading-none italic">{g.v || '—'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="col-span-4 bg-white border-2 border-indigo-50 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                            <div className="relative z-10 w-full flex flex-col items-center">
                                <div className="p-2 rounded-2xl bg-indigo-50/30 mb-3 border border-indigo-100">
                                    <TrophyIcon className="w-5 h-5 text-indigo-500" />
                                </div>
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-1 italic">Composite Standing</p>
                                <h3 className="text-6xl font-black leading-none italic mb-4" style={{ color: grade.color }}>{grade.g}</h3>
                                <div className="px-5 py-1.5 bg-indigo-50 rounded-xl inline-block border border-indigo-100">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-800 italic">{grade.label}</span>
                                </div>
                                <p className="text-sm font-black text-gray-400 mt-3 tabular-nums tracking-tighter italic uppercase">{overall}% Performance</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODULES & EVALUATION */}
                <div className="grid grid-cols-12 gap-4 mb-4 relative z-10">
                    <div className="col-span-4 space-y-4">
                        <div className="bg-gradient-to-br from-indigo-50 to-white border-l-4 border-indigo-500 p-5 rounded-2xl shadow-sm">
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                <CheckBadgeIcon className="w-3 h-3" /> Active Operative
                            </p>
                            <p className="text-[14px] font-black text-gray-900/80 leading-tight uppercase tracking-tight italic truncate">{report.current_module || 'Synthetic Core'}</p>
                        </div>
                        <div className="bg-gradient-to-br from-cyan-50 to-white border-l-4 border-cyan-500 p-5 rounded-2xl shadow-sm">
                            <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                <BoltIcon className="w-3 h-3" /> Sequence Target
                            </p>
                            <p className="text-[14px] font-black text-gray-900/80 leading-tight uppercase tracking-tight italic truncate">{report.next_module || 'Advanced Node'}</p>
                        </div>
                    </div>

                    <div className="col-span-8 grid grid-cols-2 gap-6">
                        <div className="bg-white border border-emerald-500/10 p-6 rounded-[2rem] relative shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 italic">
                                    <SparklesIcon className="w-4 h-4" /> Precision Strengths
                                </p>
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            </div>
                            <p className="text-[13px] leading-relaxed text-gray-700 font-medium italic">
                                {report.key_strengths || 'Cognitive patterns indicate high analytical precision and rapid assimilation of core technical logic.'}
                            </p>
                        </div>
                        <div className="bg-white border border-rose-500/10 p-6 rounded-[2rem] relative shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-2 italic">
                                    <BoltIcon className="w-4 h-4" /> Growth Vectors
                                </p>
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                            </div>
                            <p className="text-[13px] leading-relaxed text-gray-700 font-medium italic">
                                {report.areas_for_growth || 'Transition to complex architectural modeling is required to optimize large-scale deployment competence.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* VALIDATION DECREE */}
                {(overall >= 0 || report.has_certificate) && (
                    <div className="relative z-10 mb-3 bg-indigo-50/50 border-2 border-indigo-100 rounded-3xl px-8 py-3 flex items-center gap-6 overflow-hidden">
                        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm shrink-0">
                            <TrophyIcon className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div className="relative z-10 flex-1 min-w-0">
                            <h4 className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.6em] mb-1 italic">Official Certification Decree</h4>
                            <p className="text-[12px] font-extrabold text-indigo-900 leading-tight italic">
                                {report.certificate_text || `This document officially recognizes that ${report.student_name} has successfully completed the intensive study programme in ${report.course_name}.`}
                            </p>
                        </div>
                    </div>
                )}

                {/* SIGNATURE & AUTHENTICATION */}
                <div className="mt-auto relative z-10 bg-gray-50/50 border border-gray-100 rounded-[1.5rem] p-6">
                    <div className="flex items-end justify-between">
                        <div className="flex flex-col gap-6">
                            <div className="space-y-4">
                                <p className="text-[11px] font-black text-indigo-500/40 uppercase tracking-[0.4em] italic mb-6">Board Verification Matrix</p>
                                <div className="flex items-center gap-10">
                                    <div className="text-left">
                                        <img
                                            src="/images/signature.png"
                                            alt="Sign"
                                            className="h-12 w-auto object-contain brightness-0 opacity-80 mb-3 filter drop-shadow-xl"
                                        />
                                        <div className="w-40 h-px bg-gradient-to-r from-gray-300 via-gray-300 to-transparent mb-2" />
                                        <p className="text-sm font-black text-gray-900 uppercase tracking-widest italic leading-none">{report.instructor_name || 'Rillcod Executive'}</p>
                                        <p className="text-[9px] font-black text-indigo-500/30 uppercase tracking-[0.3em] mt-1.5">Lead Operative Directive</p>
                                    </div>
                                    <div className="w-px h-20 bg-gray-200" />
                                    {report.show_payment_notice && (
                                        <div className="flex flex-col gap-2 items-start justify-center pr-10">
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] leading-none mb-2">Cycle Ledger</p>
                                            <p className="text-3xl font-black text-gray-900 tabular-nums italic leading-none">₦{report.fee_amount || '20,000'}</p>
                                            <p className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mt-1">RILLCOD LTD · TRUSTED</p>
                                            <p className="text-[10px] font-black text-indigo-500/40 tracking-widest leading-none mt-1 uppercase italic">Providus Bank · 7901178957</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-6">
                            <div className="p-6 bg-white rounded-[2.5rem] shadow-[0_25px_50px_rgba(0,0,0,0.1)] border border-gray-50 scale-110">
                                <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={100} fgColor="#1e1b4b" />
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-[11px] font-black text-indigo-500/60 uppercase tracking-[0.5em] italic leading-none">Secure Link</p>
                                <div className="w-10 h-px bg-indigo-500/20 mt-3" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 flex items-center justify-between text-[10px] font-black text-gray-300 uppercase tracking-[0.5em] pb-2 border-t border-gray-100 pt-6">
                        <span className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500/30" />
                            Nucleus Engine v2.5 Deployment
                        </span>
                        <div className="flex gap-8">
                            <span className="truncate max-w-[200px]">Hash: {report.id?.slice(-12).toUpperCase() || 'DATA_NULL'}</span>
                            <span className="text-indigo-400/40">verify.rillcod.com</span>
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
        </>
    );
}
