// @refresh reset
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
    CheckBadgeIcon,
    ShieldCheckIcon
} from '@/lib/icons';

interface PrintableReportData {
    id?: string | null;
    student_name?: string | null;
    course_name?: string | null;
    report_term?: string | null;
    report_date?: string | null;
    section_class?: string | null;
    school_name?: string | null;
    overall_score?: number | null;
    theory_score?: number | null;
    practical_score?: number | null;
    attendance_score?: number | null;
    participation_score?: number | null;
    projects_grade?: string | null;
    homework_grade?: string | null;
    key_strengths?: string | null;
    areas_for_growth?: string | null;
    fee_status?: string | null;
    fee_amount?: number | null;
    has_certificate?: boolean | null;
    certificate_text?: string | null;
}

interface OrgSettingsData {
    logo_url?: string | null;
    org_name?: string | null;
    org_tagline?: string | null;
}

interface PrintableReportProps {
    report: PrintableReportData;
    orgSettings?: OrgSettingsData;
}

/**
 * A dedicated component for high-fidelity A4 printing.
 * Uses 210mm x 297mm dimensions to ensure absolute alignment.
 */
export default function PrintableReport({ report, orgSettings }: PrintableReportProps) {
    if (!report) return null;

    const today = report.report_date 
        ? new Date(report.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    
    const overall = Number(report.overall_score) || 0;
    const theory = Number(report.theory_score) || 0;
    const practical = Number(report.practical_score) || 0;
    const attendance = Number(report.attendance_score) || 0;
    const engagement = Number(report.participation_score) || 0;

    const getGrade = (score: number) => {
        if (score >= 85) return { g: 'A', label: 'EXCELLENT', color: '#FF914D' };
        if (score >= 70) return { g: 'B', label: 'VERY GOOD', color: '#FF914D' };
        if (score >= 55) return { g: 'C', label: 'GOOD', color: '#FF914D' };
        if (score >= 45) return { g: 'D', label: 'PASS', color: '#FF914D' };
        return { g: 'E', label: 'FAIL', color: '#ef4444' };
    };
    const grade = getGrade(overall);

    const hasPayment = report.fee_status && report.fee_status !== 'none';
    const getFeeStyle = (status: string) => {
        const styles: Record<string, { label: string; text: string; bg: string }> = {
            paid: { label: 'PAID', text: '#065f46', bg: '#d1fae5' },
            outstanding: { label: 'OUTSTANDING', text: '#991b1b', bg: '#fee2e2' },
            partial: { label: 'PARTIAL', text: '#92400e', bg: '#fef3c7' },
            sponsored: { label: 'SPONSORED', text: '#1e40af', bg: '#dbeafe' },
            waived: { label: 'WAIVED', text: '#5b21b6', bg: '#ede9fe' },
        };
        return styles[status] || null;
    };
    const feeStyle = hasPayment ? getFeeStyle(report.fee_status ?? '') : null;

    return (
        <div 
          id="printable-report"
          className="bg-white text-slate-900 font-sans relative flex flex-col p-[20mm] mx-auto overflow-hidden shadow-2xl printable-modern"
          style={{ 
            width: '210mm', 
            height: '297mm', 
            minHeight: '297mm',
            boxSizing: 'border-box', 
            WebkitPrintColorAdjust: 'exact', 
            printColorAdjust: 'exact'
          }}
        >
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    .printable-modern { 
                        box-shadow: none !important; 
                        margin: 0 !important;
                        width: 210mm !important; 
                        height: 297mm !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            ` }} />

            {/* Premium Borders */}
            <div className="absolute inset-0 border-[12px] border-[#121212] pointer-events-none" />
            <div className="absolute inset-0 border border-slate-200 m-8 pointer-events-none" />
            
            {/* Header Section */}
            <div className="relative z-10 flex justify-between items-start border-b-[6px] border-[#121212] pb-8 mb-12">
                <div className="flex gap-8">
                    <div className="p-5 bg-[#121212] shadow-2xl">
                        <img 
                          src={orgSettings?.logo_url || '/logo.png'} 
                          alt="Logo" 
                          crossOrigin="anonymous"
                          className="w-16 h-16 object-contain brightness-0 invert"
                          onError={e => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                        />
                    </div>
                    <div className="flex flex-col justify-center">
                        <h1 className="text-3xl font-black uppercase tracking-tighter italic leading-none mb-2">
                            {orgSettings?.org_name || 'Rillcod Technologies'}
                        </h1>
                        <p className="text-[10px] text-[#FF914D] font-black uppercase tracking-[0.4em] mb-4">
                            {orgSettings?.org_tagline || 'Technical Excellence Consortium'}
                        </p>
                        <div className="flex gap-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <span>ID: {report.id?.slice(0, 8) || 'PREVIEW'}</span>
                            <div className="w-1.5 h-1.5 bg-slate-200 rounded-full mt-1.5" />
                            <span>DATE: {today}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end gap-4">
                    <div className="px-8 py-2.5 bg-[#121212] text-white text-[12px] font-black uppercase tracking-[0.4em] italic leading-none">
                        Registry Copy
                    </div>
                    {hasPayment && feeStyle && (
                        <div className="flex items-center gap-4 px-5 py-2.5 bg-slate-50 border border-slate-200 shadow-sm">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">STATUS: {feeStyle.label}</span>
                           {report.fee_amount && <span className="text-sm font-black italic text-[#121212]">₦{report.fee_amount}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Identity Grid */}
            <div className="relative z-10 space-y-4 mb-12">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-[3px] bg-[#FF914D]" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] italic">Official Recipient</p>
                </div>
                <h2 className="text-6xl font-black uppercase tracking-tighter italic border-b-[10px] border-[#FF914D] pb-4 leading-none">
                    {report.student_name || 'Valued Learner'}
                </h2>

                <div className="grid grid-cols-4 gap-12 pt-6">
                    <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Programme</p>
                        <p className="text-[15px] font-black text-[#121212] uppercase italic leading-tight">{report.course_name || 'STEM Synthesis'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Timeline</p>
                        <p className="text-[15px] font-black text-[#121212] uppercase italic leading-tight">{report.report_term || 'S1-2024'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Academic Level</p>
                        <p className="text-[15px] font-black text-[#121212] uppercase italic leading-tight">{report.section_class || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Institution</p>
                        <p className="text-[15px] font-black text-[#121212] uppercase italic leading-tight">{report.school_name || 'Rillcod'}</p>
                    </div>
                </div>
            </div>

            {/* Performance Hub */}
            <div className="relative z-10 grid grid-cols-12 gap-12 mb-12">
                <div className="col-span-8 flex flex-col gap-8">
                    <div className="flex items-center gap-4">
                        <h3 className="text-[13px] font-black uppercase tracking-[0.6em] text-[#121212] italic shrink-0">Mastery Matrix</h3>
                        <div className="h-[2px] w-full bg-slate-100" />
                    </div>

                    <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                        {[
                            { label: 'Examination (40%)', value: theory, color: 'bg-[#121212]' },
                            { label: 'Evaluation (20%)', value: practical, color: 'bg-[#FF914D]' },
                            { label: 'Assignment (20%)', value: attendance, color: 'bg-[#121212]' },
                            { label: 'Project Engagement (20%)', value: engagement, color: 'bg-[#FF914D]' }
                        ].map(m => (
                            <div key={m.label} className="space-y-3">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{m.label}</span>
                                    <span className="text-[17px] font-black italic tabular-nums text-[#121212]">{m.value}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-50 border border-slate-100">
                                    <div className={`h-full ${m.color}`} style={{ width: `${m.value}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6 pt-8 border-t-[3px] border-slate-100 mt-2">
                        <div className="p-5 bg-slate-50 border-l-[6px] border-[#121212]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Laboratory Performance</p>
                            <p className="text-[20px] font-black text-[#121212] uppercase italic leading-none">{report.projects_grade || 'OPTIMAL'}</p>
                        </div>
                        <div className="p-5 bg-slate-50 border-l-[6px] border-[#FF914D]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Assignment Analytics</p>
                            <p className="text-[20px] font-black text-[#121212] uppercase italic leading-none">{report.homework_grade || 'SUBMITTED'}</p>
                        </div>
                    </div>
                </div>

                <div className="col-span-4 flex flex-col items-center justify-center text-center bg-[#121212] p-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[5px] bg-[#FF914D]" />
                    <p className="text-[11px] font-black text-[#FF914D] uppercase tracking-[0.5em] mb-6 italic leading-none">Final Grade</p>
                    <h3 className="text-[140px] font-black italic leading-none text-white tracking-tighter mb-6">{grade.g}</h3>
                    <div className="px-8 py-2.5 bg-[#FF914D] text-black text-[14px] font-black uppercase tracking-[0.3em]">
                        {grade.label}
                    </div>
                    <p className="text-3xl font-black text-white/20 mt-6 tabular-nums">SCORE: {overall}%</p>
                </div>
            </div>

            {/* Qualitative Insights */}
            <div className="relative z-10 grid grid-cols-2 gap-10 mb-12">
                <div className="p-10 bg-slate-50 border border-slate-200 relative">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-2 bg-[#FF914D]/10 border border-[#FF914D]/20">
                            <SparklesIcon className="w-5 h-5 text-[#FF914D]" />
                        </div>
                        <h4 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#121212] italic">Identified Strengths</h4>
                    </div>
                    <p className="text-[15px] leading-relaxed text-slate-600 font-bold italic">
                        {report.key_strengths || 'The student demonstrates exceptional aptitude in logical deduction and technical synthesis.'}
                    </p>
                </div>
                <div className="p-10 bg-slate-50 border border-slate-200 relative">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-2 bg-[#121212]/5 border border-[#121212]/10">
                            <BoltIcon className="w-5 h-5 text-[#121212]" />
                        </div>
                        <h4 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#121212] italic">Growth Calibration</h4>
                    </div>
                    <p className="text-[15px] leading-relaxed text-slate-600 font-bold italic">
                        {report.areas_for_growth || 'Focus on architectural modularity and technical documentation will optimize deployment competence.'}
                    </p>
                </div>
            </div>

            {/* Certification Decree */}
            {(overall >= 45 || report.has_certificate) && (
                <div className="relative z-10 mb-12 p-8 bg-white border-y-4 border-[#121212] flex items-center gap-10">
                    <TrophyIcon className="w-12 h-12 text-[#FF914D] shrink-0" />
                    <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[1.2em] mb-2 italic leading-none">Official Decree</p>
                        <p className="text-[16px] font-black text-[#121212] leading-tight italic">
                            {report.certificate_text || `This document officially recognizes the mastery demonstrated by ${report.student_name} in ${report.course_name}.`}
                        </p>
                    </div>
                </div>
            )}

            {/* Board Verification & Signatures */}
            <div className="relative z-10 mt-auto flex justify-between items-end pt-10 border-t-[3px] border-slate-100 flex-1">
                <div className="flex gap-20">
                    <div className="text-center">
                        <img src="/images/signature.png" alt="Director" className="h-16 mx-auto mb-3 opacity-90 contrast-125" crossOrigin="anonymous" />
                        <div className="w-48 h-[2.5px] bg-[#121212] mx-auto mb-1.5" />
                        <p className="text-[13px] font-black text-[#121212] uppercase italic">Executive Director</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rillcod Technologies</p>
                    </div>
                    <div className="text-center">
                        <img src="/images/signature.png" alt="Head" className="h-16 mx-auto mb-3 opacity-80 contrast-125" crossOrigin="anonymous" />
                        <div className="w-48 h-[2.5px] bg-[#121212] mx-auto mb-1.5" />
                        <p className="text-[13px] font-black text-[#121212] uppercase italic">Lead Registrar</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Board of Governors</p>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-white border border-slate-200">
                        <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={70} fgColor="#121212" />
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] leading-none">ID SECURITY HASH</p>
                </div>
            </div>

            {/* Footer Branding */}
            <div className="absolute bottom-0 inset-x-0 h-5 flex">
                <div className="flex-[4] bg-[#121212]" />
                <div className="flex-[1] bg-[#FF914D]" />
                <div className="flex-[0.5] bg-slate-300" />
            </div>
        </div>
    );
}
