'use client';

import React from 'react';
import QRCode from 'react-qr-code';

function SparklesIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            <path d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
    );
}

function CrownIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return (
        <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
    );
}

export function letterGrade(pct: number) {
    if (pct >= 85) return { g: 'A', label: 'Excellent', color: '#1a6b3c' };
    if (pct >= 70) return { g: 'B', label: 'Very Good', color: '#1a4d8c' };
    if (pct >= 55) return { g: 'C', label: 'Good', color: '#7c6b15' };
    if (pct >= 45) return { g: 'D', label: 'Pass', color: '#8c3a14' };
    return { g: 'E', label: 'Fail', color: '#8c1414' };
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-end">
                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
                <span className="text-sm font-black" style={{ color }}>{value}%</span>
            </div>
            <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function GradeRow({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div className="flex justify-between items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">{label}</span>
            <span className="text-[10px] font-black text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-right leading-tight">
                {value ?? '—'}
            </span>
        </div>
    );
}

function SectionHeaderPremium({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-4">
            <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-[0.15em] shrink-0">{title}</h3>
            <div className="h-[2px] w-full bg-gray-50 flex items-center">
                <div className="h-[2px] w-8 bg-violet-600/30" />
            </div>
        </div>
    );
}

function ReportField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div>
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-0.5">{label}</p>
            <p className={`text-[13px] ${bold ? 'font-black' : 'font-bold'} text-gray-900`}>{value}</p>
        </div>
    );
}

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
    // Payment / fee info (all optional — omitted when not applicable)
    school_section?: string | null;
    fee_label?: string | null;
    fee_amount?: string | null;
    fee_status?: 'paid' | 'outstanding' | 'partial' | 'sponsored' | 'waived' | '' | null;
    // Next-term payment notice (shown between signature and QR when enabled)
    show_payment_notice?: boolean | null;
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

export default function ReportCard({ report, orgSettings }: {
    report: ReportCardData;
    orgSettings: OrgSettings | null;
}) {
    const today = report.report_date
        ? new Date(report.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    const hasPayment = !!report.fee_status;
    const feeStyle = report.fee_status ? FEE_STATUS_STYLE[report.fee_status] : null;

    const theory     = Number(report.theory_score)     || 0;
    const practical  = Number(report.practical_score)  || 0;
    const attendance = Number(report.attendance_score) || 0;
    // Always compute from components; use stored overall_score only when > 0
    const computed = Math.round(theory * 0.4 + practical * 0.4 + attendance * 0.2);
    const overall  = Number(report.overall_score) > 0 ? Number(report.overall_score) : computed;
    const grade = letterGrade(overall);
    const showCertificate = overall >= 45 || report.has_certificate === true;

    const org: OrgSettings = {
        org_name: orgSettings?.org_name || 'Rillcod Technologies',
        org_tagline: orgSettings?.org_tagline || 'Excellence in Educational Technology',
        org_address: orgSettings?.org_address || '26 Ogiesoba Avenue, GRA, Benin City',
        org_phone: orgSettings?.org_phone || '08116600091',
        org_email: orgSettings?.org_email || 'rillcod@gmail.com',
        logo_url: orgSettings?.logo_url || '/images/logo.png',
    };

    return (
        <div
            id="report-card"
            className="bg-white text-gray-900 font-sans relative overflow-hidden shrink-0 flex flex-col"
            style={{ width: 794, height: 1123, margin: '0 auto', fontSize: 13, border: '4px solid #1a1a2e', position: 'relative', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
            {/* Background */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-50/50 rounded-full blur-3xl -z-10 -mr-40 -mt-40 print:opacity-100" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-50/50 rounded-full blur-3xl -z-10 -ml-40 -mb-40 print:opacity-100" />
            <div className="absolute inset-0 border-[1px] border-gray-100 m-4 pointer-events-none" />

            {/* HEADER */}
            <div className="relative pt-8 pb-6 px-12 bg-white border-b border-gray-200" style={{ borderBottom: '2px solid #e5e7eb', borderLeft: '6px solid #1a1a2e' }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 skew-x-12 -mr-16" />
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-6">
                        <img
                            src={org.logo_url!}
                            alt="Logo"
                            crossOrigin="anonymous"
                            className="w-20 h-20 object-contain"
                            onError={e => { (e.target as HTMLImageElement).src = '/images/logo.png'; }}
                        />
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none mb-1 text-gray-900">
                                {org.org_name || 'Rillcod Academy'}
                            </h1>
                            <p className="text-[11px] font-bold text-violet-600 uppercase tracking-[0.3em]">
                                {org.org_tagline || 'Pioneering Technical Excellence'}
                            </p>
                            {(org.org_phone || org.org_email) && (
                                <p className="text-[10px] font-semibold text-gray-400 mt-1">
                                    {org.org_phone && <>📞 {org.org_phone}</>}
                                    {org.org_phone && org.org_email && <span className="mx-1.5 opacity-40">·</span>}
                                    {org.org_email && <>✉ {org.org_email}</>}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-amber-50 border border-amber-200 rounded-full mb-2">
                            <span className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Official Record</span>
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Progress Report</h2>
                    </div>
                </div>
            </div>

            {/* STATS BAR */}
            <div className="bg-gray-50 border-y border-gray-100 px-12 py-3 flex justify-between items-center">
                <div className="flex gap-8">
                    <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">ID</p>
                        <p className="text-[12px] font-black text-gray-900">{report.id?.slice(0, 8).toUpperCase() ?? 'PREVIEW'}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Date</p>
                        <p className="text-[12px] font-black text-gray-900">{today}</p>
                    </div>
                    {report.school_name && (
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">School</p>
                            <p className="text-[12px] font-black text-gray-900">{report.school_name}</p>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-6">
                    {hasPayment && feeStyle && (
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{report.fee_label || 'Fee'}</p>
                            <div className="flex items-center gap-1.5">
                                {report.fee_amount && <span className="text-[12px] font-black text-gray-900">₦{report.fee_amount}</span>}
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                                    style={{ backgroundColor: feeStyle.bg, color: feeStyle.text }}>
                                    {feeStyle.label}
                                </span>
                            </div>
                        </div>
                    )}
                    <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Verify</p>
                        <p className="text-[12px] font-black text-gray-900">rillcod.com/verify</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 px-10 py-6 flex flex-col gap-4" style={{ minHeight: 0 }}>
                {/* PROFILE & PERFORMANCE */}
                <div className="grid grid-cols-12 gap-6" style={{ alignItems: 'stretch' }}>
                    {/* Identity */}
                    <div className="col-span-4 flex flex-col gap-2">

                        {/* Student Participant panel */}
                        <div className="bg-white rounded-3xl px-6 py-5 border border-gray-200" style={{ borderLeft: '5px solid #1a1a2e' }}>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 mb-2">Student Participant</p>
                            <p className="text-lg font-black text-gray-900 leading-tight mb-1">{report.student_name ?? '—'}</p>
                            <div className="h-px bg-gray-200 my-2.5" />
                            <div className="space-y-1.5">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Programme</p>
                                    <p className="text-[13px] font-bold text-gray-700">{report.course_name ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Class / Section</p>
                                    <p className="text-[13px] font-bold text-gray-700">{report.section_class ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        {report.school_section === 'school' ? 'Academic Term' : 'Duration'}
                                    </p>
                                    <p className="text-[13px] font-bold text-gray-700">
                                        {report.school_section === 'school'
                                            ? `${report.report_term ?? '—'}${report.report_period ? ` · ${report.report_period}` : ''}`
                                            : (report.course_duration ?? report.report_term ?? '—')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Modules — stacked, always visible */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 14px' }}>
                                <p style={{ fontSize: 9, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Current Module</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>{report.current_module || '—'}</p>
                            </div>
                            <div style={{ backgroundColor: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 12, padding: '8px 14px' }}>
                                <p style={{ fontSize: 9, fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Upcoming Module</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95', lineHeight: 1.3 }}>{report.next_module || '—'}</p>
                            </div>
                        </div>

                    </div>

                    {/* Academic Metrics */}
                    <div className="col-span-8 flex flex-col gap-3">
                        <SectionHeaderPremium title="Final Performance Assessment" />
                        <div className="flex-1 grid grid-cols-2 gap-5">

                            {/* Left — scores + qualitative grades */}
                            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 flex flex-col gap-3">
                                <MetricBar label="Theory (40%)" value={theory} color="#6366f1" />
                                <MetricBar label="Practical (40%)" value={practical} color="#10b981" />
                                <MetricBar label="Attendance (20%)" value={attendance} color="#f59e0b" />

                                {/* Qualitative grades — same column, thin rule separator */}
                                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
                                    <GradeRow label="Participation" value={report.participation_grade} />
                                    <GradeRow label="Project Work" value={report.projects_grade} />
                                    <GradeRow label="Homework"      value={report.homework_grade} />
                                </div>
                            </div>

                            {/* Right — weighted grade display */}
                            <div className="flex flex-col items-center justify-center bg-gray-50 rounded-[32px] p-6 relative overflow-hidden border border-gray-200" style={{ borderLeft: '4px solid #1a1a2e' }}>
                                <div className="relative z-10 text-center">
                                    <SparklesIcon className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Final Weighted Grade</p>
                                    <h3 className="text-8xl font-black" style={{ color: grade.color }}>{grade.g}</h3>
                                    <div className="mt-4 px-4 py-1.5 bg-white rounded-full border border-gray-200">
                                        <span className="text-xs font-black uppercase tracking-widest text-gray-700">{grade.label}</span>
                                    </div>
                                    <p className="text-2xl font-black text-gray-500 mt-3">{overall}%</p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>


                {/* EVALUATION */}
                <div className="flex-1 grid grid-cols-2 gap-6" style={{ minHeight: 0, maxHeight: 200 }}>
                    <div className="flex flex-col gap-2">
                        <SectionHeaderPremium title="Core Strengths" />
                        <div className="flex-1 p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                            <p className="text-[12px] leading-relaxed text-emerald-900/80 italic font-medium">
                                "{report.key_strengths || 'The student shows consistent effort and a dedicated approach to theoretical concepts, displaying high focus during complex sessions.'}"
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <SectionHeaderPremium title="Growth Focus" />
                        <div className="flex-1 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                            <p className="text-[12px] leading-relaxed text-amber-900/80 italic font-medium">
                                "{report.areas_for_growth || 'Further immersion in practical projects will help build implementation confidence and speed in real-world environments.'}"
                            </p>
                        </div>
                    </div>
                </div>

                {/* CERTIFICATE */}
                {showCertificate && (
                    <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef9e7 100%)', border: '1px solid #fde68a', borderRadius: 28, padding: '18px 28px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: 28, background: 'linear-gradient(135deg, rgba(253,230,138,0.25) 0%, transparent 60%)', pointerEvents: 'none' }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ height: 1, width: 36, background: 'linear-gradient(to right, transparent, #e4a817)', opacity: 0.6 }} />
                            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #fef08a 0%, #fcd34d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(234,168,23,0.35), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
                                <CrownIcon className="w-6 h-6" style={{ color: '#92400e' } as any} />
                            </div>
                            <div style={{ height: 1, width: 36, background: 'linear-gradient(to left, transparent, #e4a817)', opacity: 0.6 }} />
                        </div>
                        <h4 style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#a16207', marginBottom: 5 }}>Academic Excellence Award</h4>
                        <p style={{ fontSize: 11, color: '#b45309', lineHeight: 1.65, fontStyle: 'italic', fontWeight: 400, maxWidth: 500, margin: '0 auto', opacity: 0.85 }}>
                            {report.certificate_text || `This document officially recognizes that ${report.student_name} has successfully completed the intensive study programme in ${report.course_name}.`}
                        </p>
                    </div>
                )}

                {/* SIGNATURES & QR */}
                <div className="pt-4 border-t-2 border-gray-100">
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>

                        {/* Left — signature */}
                        <div style={{ flexShrink: 0 }}>
                            <p style={{ fontSize: 10, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Signatory Authority</p>
                            <img
                                src="/images/signature.png"
                                alt="Official Signature"
                                style={{ height: 56, width: 'auto', objectFit: 'contain', mixBlendMode: 'multiply' }}
                            />
                            <div style={{ width: 180, height: 1, backgroundColor: '#111827', marginBottom: 2 }} />
                            <p style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>Mr Osahon</p>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Director, Rillcod Technologies</p>
                        </div>

                        {/* Centre — payment notice, 3 lines, centred */}
                        {report.show_payment_notice && (
                            <div style={{ flex: 1, backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '10px 14px', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4 }}>
                                <p style={{ fontSize: 9, fontWeight: 900, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Next Term Fee Payment</p>
                                <p style={{ fontSize: 20, fontWeight: 900, color: '#78350f', lineHeight: 1 }}>₦20,000 &nbsp;·&nbsp; RILLCOD LTD</p>
                                <p style={{ fontSize: 20, fontWeight: 900, color: '#78350f', lineHeight: 1 }}>Providus Bank · <span style={{ color: '#92400e' }}>7901178957</span></p>
                                <p style={{ fontSize: 9, fontWeight: 700, color: '#b45309' }}>Use student name as reference · Send proof to admin</p>
                            </div>
                        )}

                        {/* Right — QR */}
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ padding: 10, backgroundColor: '#fff', border: '3px solid #f3f4f6', borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 6 }}>
                                <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) ?? 'preview'}`} size={72} />
                            </div>
                            <p style={{ fontSize: 10, fontWeight: 900, color: '#111827', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
                                VERIFY {report.id?.slice(0, 8).toUpperCase() ?? 'PREVIEW'}
                            </p>
                        </div>

                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500" />
        </div>
    );
}
