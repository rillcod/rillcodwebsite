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
} from '@/lib/icons';

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
    paid: { bg: '#d1fae5', text: '#065f46', label: 'PAID' },
    outstanding: { bg: '#fee2e2', text: '#991b1b', label: 'OUTSTANDING' },
    partial: { bg: '#fef3c7', text: '#92400e', label: 'PARTIAL PAYMENT' },
    sponsored: { bg: '#dbeafe', text: '#1e40af', label: 'SPONSORED' },
    waived: { bg: '#ede9fe', text: '#5b21b6', label: 'WAIVED' },
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
          className="bg-white text-slate-900 font-sans relative overflow-hidden flex flex-col p-10 shadow-2xl mx-auto printable-modern"
          style={{ width: '210mm', height: '297mm', minHeight: '297mm', boxSizing: 'border-box', WebkitPrintColorAdjust: 'exact' }}
        >
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    .printable-modern { 
                        box-shadow: none !important; 
                        width: 210mm !important; 
                        height: 297mm !important; 
                    }
                }
            ` }} />

            {/* Background Texture */}
            <div className="absolute inset-0 border-[16px] border-slate-50 pointer-events-none" />
            <div className="absolute inset-0 border border-slate-100 m-8 pointer-events-none" />
            
            {/* Header Section */}
            <div className="relative z-10 flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
                <div className="flex gap-6">
                    <div className="p-4 bg-slate-950 rounded-none shadow-lg">
                        <img 
                          src={orgSettings?.logo_url || '/logo.png'} 
                          alt="Logo" 
                          crossOrigin="anonymous"
                          className="w-14 h-14 object-contain brightness-0 invert"
                          onError={e => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                        />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter leading-none italic mb-1">
                            {orgSettings?.org_name || 'Rillcod Technologies'}
                        </h1>
                        <p className="text-[9px] text-teal-600 font-black uppercase tracking-[0.4em] mb-3">
                            {orgSettings?.org_tagline || 'Technical Excellence Consortium'}
                        </p>
                        <div className="flex gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <span>ID: {report.id?.slice(0, 8) || 'PREVIEW'}</span>
                            <span>DATE: {today}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="inline-block px-4 py-1.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.3em] mb-3 italic">
                        Progress Report
                    </div>
                    {hasPayment && feeStyle && (
                        <div className="flex items-center justify-end gap-2 px-3 py-1 bg-slate-50 border border-slate-200">
                           <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">FEE {feeStyle.label}</span>
                           {report.fee_amount && <span className="text-[10px] font-black italic">₦{report.fee_amount}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Content Identity Grid */}
            <div className="relative z-10 grid grid-cols-[1fr_200px] gap-8 mb-8">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <p className="text-[10px] items-center gap-2 font-black text-slate-400 uppercase tracking-[0.4em] flex">
                            <UserCircleIcon className="w-4 h-4 text-teal-500" /> Student Profile
                        </p>
                        <h2 className="text-4xl font-black uppercase tracking-tighter italic border-b-4 border-teal-500 pb-2">
                            {report.student_name || 'Valued Learner'}
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Programme / Course</p>
                                <p className="text-sm font-black text-slate-900 uppercase italic leading-tight">{report.course_name || 'STEM Advancement'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Term / Period</p>
                                <p className="text-sm font-black text-slate-900 uppercase italic leading-tight">{report.report_term || 'S1-2024'}{report.report_period ? ` · ${report.report_period}` : ''}</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Academic Level</p>
                                <p className="text-sm font-black text-slate-900 uppercase italic leading-tight">{report.section_class || 'Grade Level'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Affiliated School</p>
                                <p className="text-sm font-black text-slate-900 uppercase italic leading-tight">{report.school_name || 'Rillcod Global'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Photo Area */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-36 h-44 bg-slate-50 border-2 border-slate-900 relative overflow-hidden shadow-lg">
                        {report.photo_url ? (
                            <img src={report.photo_url} alt="Student" className="w-full h-full object-cover" crossOrigin="anonymous" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                <UserCircleIcon className="w-16 h-16 text-slate-300 opacity-50" />
                            </div>
                        )}
                        <div className="absolute inset-0 border border-white/20 pointer-events-none" />
                    </div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">Official Transcript Photo</p>
                </div>
            </div>

            {/* Performance Hub */}
            <div className="relative z-10 grid grid-cols-12 gap-8 mb-8">
                <div className="col-span-12">
                    <div className="flex items-center gap-4 mb-4">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-900 italic">Technical Matrix</h3>
                        <div className="h-[2px] flex-1 bg-slate-100" />
                    </div>
                </div>

                <div className="col-span-8 space-y-5">
                    {[
                        { label: 'Theory Protocols', value: theory, color: 'bg-indigo-600' },
                        { label: 'Practical Synthesis', value: practical, color: 'bg-teal-600' },
                        { label: 'Presence Metric', value: attendance, color: 'bg-slate-900' },
                        { label: 'Engagement Data', value: report.participation_score || 0, color: 'bg-orange-600' }
                    ].map(m => (
                        <div key={m.label} className="space-y-2">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.label}</span>
                                <span className="text-lg font-black italic tabular-nums text-slate-900">{m.value}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-50 border border-slate-100">
                                <div className={`h-full ${m.color}`} style={{ width: `${m.value}%` }} />
                            </div>
                        </div>
                    ))}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                        <div className="p-4 bg-slate-50 rounded-none border-l-4 border-indigo-400">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Project Grade</p>
                            <p className="text-lg font-black text-slate-900 italic uppercase leading-none">{report.projects_grade || '—'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-none border-l-4 border-teal-400">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Homework Hub</p>
                            <p className="text-lg font-black text-slate-900 italic uppercase leading-none">{report.homework_grade || '—'}</p>
                        </div>
                    </div>
                </div>

                <div className="col-span-4 flex flex-col items-center justify-center text-center bg-slate-950 p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-teal-500" />
                    <p className="text-[9px] font-black text-teal-500 uppercase tracking-[0.4em] mb-4 italic">Composite Standing</p>
                    <h3 className="text-8xl font-black italic leading-none text-white tracking-tighter mb-4 drop-shadow-lg">{grade.g}</h3>
                    <div className="px-6 py-2 bg-teal-600 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-lg">
                        {grade.label}
                    </div>
                </div>
            </div>

            {/* Qualitative Insights */}
            <div className="relative z-10 grid grid-cols-2 gap-8 mb-8 flex-1">
                <div className="p-6 bg-slate-50 border border-slate-100 relative">
                    <div className="flex items-center gap-2 mb-3">
                        <SparklesIcon className="w-5 h-5 text-teal-600" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 italic">Precision Strengths</h4>
                    </div>
                    <p className="text-[12px] leading-relaxed text-slate-600 font-bold italic">
                        {report.key_strengths || 'The student shows consistent effort and a dedicated approach to complex problem-solving patterns.'}
                    </p>
                </div>
                <div className="p-6 bg-slate-50 border border-slate-100 relative">
                    <div className="flex items-center gap-2 mb-3">
                        <BoltIcon className="w-5 h-5 text-indigo-600" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 italic">Growth Vectors</h4>
                    </div>
                    <p className="text-[12px] leading-relaxed text-slate-600 font-bold italic">
                        {report.areas_for_growth || 'Focus on architectural modularity and technical documentation will optimize larger scale deployment competence.'}
                    </p>
                </div>
            </div>

            {/* Validation Decree */}
            {(overall >= 45 || report.has_certificate) && (
                <div className="relative z-10 mb-8 p-6 bg-white border-y-4 border-slate-900 flex items-center gap-6">
                    <TrophyIcon className="w-10 h-10 text-teal-500 shrink-0" />
                    <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.8em] mb-1 italic leading-none">Official Graduation Decree</p>
                        <p className="text-sm font-black text-slate-900 leading-tight italic">
                            {report.certificate_text || `This document officially recognizes the mastery demonstrated by ${report.student_name} in ${report.course_name}.`}
                        </p>
                    </div>
                </div>
            )}

            {/* Board Verification & Signatures */}
            <div className="relative z-10 mt-auto grid grid-cols-[1fr_200px] gap-12 pt-8">
                <div className="flex gap-16">
                    <div className="text-center">
                        <img src="/images/signature.png" alt="Director" className="h-12 mx-auto mb-2 mix-blend-multiply opacity-90" crossOrigin="anonymous" />
                        <div className="w-40 h-[2px] bg-slate-900 mx-auto mb-1" />
                        <p className="text-[10px] font-black text-slate-900 uppercase italic">Board Director</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rillcod Technologies</p>
                    </div>
                    <div className="text-center">
                        <img src="/images/signature.png" alt="Head" className="h-12 mx-auto mb-2 mix-blend-multiply opacity-70" crossOrigin="anonymous" />
                        <div className="w-40 h-[2px] bg-slate-900 mx-auto mb-1" />
                        <p className="text-[10px] font-black text-slate-900 uppercase italic">Academic Head</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mastery Assessor</p>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-white border border-slate-100 shadow-sm">
                        <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={80} fgColor="#020617" />
                    </div>
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">Verify Hash</p>
                </div>
            </div>

            {/* Footer Stripes */}
            <div className="absolute bottom-0 inset-x-0 h-4 flex">
                <div className="flex-1 bg-slate-950" />
                <div className="flex-1 bg-teal-500" />
                <div className="flex-1 bg-indigo-500" />
                <div className="flex-1 bg-orange-500" />
            </div>
        </div>
    );
}
