'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { Crown, Sparkles } from 'lucide-react';
import QRCode from 'react-qr-code';

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
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
                <span className="text-xs font-black" style={{ color }}>{value}%</span>
            </div>
            <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function SectionHeaderPremium({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-4">
            <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.15em] shrink-0">{title}</h3>
            <div className="h-[2px] w-full bg-gray-50 flex items-center">
                <div className="h-[2px] w-8 bg-violet-600/30" />
            </div>
        </div>
    );
}

function ReportField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div>
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-0.5">{label}</p>
            <p className={`text-[12px] ${bold ? 'font-black' : 'font-bold'} text-gray-900`}>{value}</p>
        </div>
    );
}

export interface ReportCardData {
    id?: string | null;
    student_name?: string | null;
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
    learning_milestones?: string[] | null;
    is_published?: boolean | null;
    // Payment / fee info (all optional — omitted when not applicable)
    school_section?: string | null;
    fee_label?: string | null;
    fee_amount?: string | null;
    fee_status?: 'paid' | 'outstanding' | 'partial' | 'sponsored' | 'waived' | '' | null;
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

    const theory = report.theory_score ?? 0;
    const practical = report.practical_score ?? 0;
    const attendance = report.attendance_score ?? 0;
    const overall = report.overall_score ?? Math.round(theory * 0.4 + practical * 0.4 + attendance * 0.2);
    const grade = letterGrade(overall);

    const org: OrgSettings = {
        org_name: orgSettings?.org_name || 'Rillcod Technologies',
        org_tagline: orgSettings?.org_tagline || 'Excellence in Educational Technology',
        org_address: orgSettings?.org_address || '26 Ogiesoba Avenue, GRA, Benin City',
        org_phone: orgSettings?.org_phone || '08116600091',
        org_email: orgSettings?.org_email || 'rillcod@gmail.com',
        logo_url: orgSettings?.logo_url || '/images/logo.png',
    };

    const milestones = Array.isArray(report.learning_milestones) ? report.learning_milestones : [];

    return (
        <div
            id="report-card"
            className="bg-white text-gray-900 font-sans relative overflow-hidden shrink-0"
            style={{ width: 794, height: 1123, margin: '0 auto', fontSize: 11, border: '16px solid #1a1a2e', position: 'relative', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
            {/* Background */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-50/50 rounded-full blur-3xl -z-10 -mr-40 -mt-40 print:opacity-100" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-50/50 rounded-full blur-3xl -z-10 -ml-40 -mb-40 print:opacity-100" />
            <div className="absolute inset-0 border-[1px] border-gray-100 m-4 pointer-events-none" />

            {/* HEADER */}
            <div className="relative pt-12 pb-8 px-12 bg-[#1a1a2e] text-white">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 skew-x-12 -mr-16" />
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
                            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none mb-1">
                                {org.org_name || 'Rillcod Academy'}
                            </h1>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-[0.3em] opacity-80">
                                {org.org_tagline || 'Pioneering Technical Excellence'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-2">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Official Record</span>
                        </div>
                        <h2 className="text-3xl font-black text-white/90 uppercase tracking-tighter">Progress Report</h2>
                    </div>
                </div>
            </div>

            {/* STATS BAR */}
            <div className="bg-gray-50 border-y border-gray-100 px-12 py-3 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <div className="flex gap-6">
                    <span>ID: <span className="text-gray-900">{report.id?.slice(0, 8).toUpperCase() ?? 'PREVIEW'}</span></span>
                    <span>Date: <span className="text-gray-900">{today}</span></span>
                    {report.school_section && (
                        <span>Section: <span className="text-gray-900">{report.school_section}</span></span>
                    )}
                </div>
                <div className="flex items-center gap-6">
                    {hasPayment && feeStyle && (
                        <span className="flex items-center gap-1.5">
                            {report.fee_label && <span className="text-gray-500">{report.fee_label}:</span>}
                            {report.fee_amount && <span className="text-gray-900">₦{report.fee_amount}</span>}
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black"
                                style={{ backgroundColor: feeStyle.bg, color: feeStyle.text }}>
                                {feeStyle.label}
                            </span>
                        </span>
                    )}
                    <span>Verify: <span className="text-gray-900">rillcod.com/verify</span></span>
                </div>
            </div>

            <div className="p-12 space-y-10">
                {/* PROFILE & PERFORMANCE */}
                <div className="grid grid-cols-12 gap-10">
                    {/* Identity */}
                    <div className="col-span-4 space-y-4">
                        <div className="bg-[#1a1a2e] rounded-3xl px-6 py-6">
                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-3">Student Participant</p>
                            <p className="text-base font-black text-white leading-tight mb-1">{report.student_name ?? '—'}</p>
                            <div className="h-px bg-white/10 my-3" />
                            <div className="space-y-2">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Programme</p>
                                    <p className="text-[12px] font-bold text-white/80">{report.course_name ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Section / Class</p>
                                    <p className="text-[12px] font-bold text-white/80">{report.section_class ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Academic Term</p>
                                    <p className="text-[12px] font-bold text-white/80">{report.report_term ?? '—'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Academic Metrics */}
                    <div className="col-span-8 flex flex-col">
                        <SectionHeaderPremium title="Final Performance Assessment" />
                        <div className="flex-1 mt-6 grid grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <MetricBar label="Theory (40%)" value={theory} color="#6366f1" />
                                <MetricBar label="Practical (40%)" value={practical} color="#10b981" />
                                <MetricBar label="Attendance (20%)" value={attendance} color="#f59e0b" />
                                <div className="grid grid-cols-2 gap-4 mt-8">
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Participation</p>
                                        <p className="text-xs font-bold text-gray-900">{report.participation_grade ?? '—'}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Project Output</p>
                                        <p className="text-xs font-bold text-gray-900">{report.projects_grade ?? '—'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-center justify-center bg-[#1a1a2e] rounded-[32px] p-6 text-white relative overflow-hidden">
                                <div className="relative z-10 text-center">
                                    <Sparkles className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Final Weighted Grade</p>
                                    <h3 className="text-8xl font-black text-white drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)]">{grade.g}</h3>
                                    <div className="mt-4 px-4 py-1.5 bg-white/10 rounded-full border border-white/10">
                                        <span className="text-xs font-black uppercase tracking-widest text-white/80">{grade.label}</span>
                                    </div>
                                    <p className="text-2xl font-black text-white/60 mt-3">{overall}%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MILESTONES */}
                {milestones.length > 0 && (
                    <div className="relative">
                        <SectionHeaderPremium title="Learning Milestones & Objectives" />
                        <div className="mt-6 grid grid-cols-2 gap-x-12 gap-y-4">
                            {milestones.map((m, i) => (
                                <div key={i} className="flex gap-4 group">
                                    <div className="w-6 h-6 rounded-full bg-violet-600/10 flex items-center justify-center flex-shrink-0">
                                        <CheckIcon className="w-3.5 h-3.5 text-violet-600" />
                                    </div>
                                    <p className="text-[11.5px] leading-relaxed text-gray-600 font-medium">{m}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* EVALUATION */}
                <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-4">
                        <SectionHeaderPremium title="Core Strengths" />
                        <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-3xl min-h-[120px]">
                            <p className="text-[11.5px] leading-relaxed text-emerald-900/80 italic font-medium">
                                "{report.key_strengths || 'The student shows consistent effort and a dedicated approach to theoretical concepts, displaying high focus during complex sessions.'}"
                            </p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <SectionHeaderPremium title="Growth Focus" />
                        <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-3xl min-h-[120px]">
                            <p className="text-[11.5px] leading-relaxed text-amber-900/80 italic font-medium">
                                "{report.areas_for_growth || 'Further immersion in practical projects will help build implementation confidence and speed in real-world environments.'}"
                            </p>
                        </div>
                    </div>
                </div>

                {/* CERTIFICATE */}
                {report.has_certificate && (
                    <div className="bg-gradient-to-r from-[#1a1a2e] to-[#252545] rounded-[40px] p-8 text-white relative overflow-hidden text-center shadow-2xl">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 -mr-12 -mt-12 rounded-full" />
                        <Crown className="w-10 h-10 text-amber-400 mx-auto mb-4" />
                        <h4 className="text-xl font-black uppercase tracking-[0.2em] mb-3">Academic Excellence Award</h4>
                        <p className="text-sm text-white/60 leading-relaxed max-w-2xl mx-auto italic font-medium">
                            {report.certificate_text || `This document officially recognizes that ${report.student_name} has successfully completed the intensive study programme in ${report.course_name}.`}
                        </p>
                    </div>
                )}

                {/* SIGNATURES & QR */}
                <div className="pt-10 flex items-end justify-between border-t-2 border-gray-100">
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Signatory Authority</p>
                        {/* Official signature */}
                        <img
                            src="/images/signature.png"
                            alt="Official Signature"
                            className="h-16 w-auto object-contain"
                            style={{ mixBlendMode: 'multiply' }}
                        />
                        <div className="space-y-0.5">
                            <div className="w-48 h-[1px] bg-gray-900" />
                            <p className="text-xs font-black text-gray-900">{report.instructor_name || 'Class Instructor'}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Head of Academics, Rillcod</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="p-3 bg-white border-4 border-gray-50 rounded-[32px] shadow-sm mb-4">
                            <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) ?? 'preview'}`} size={80} />
                        </div>
                        <p className="text-[10px] font-black text-gray-900 tracking-[0.3em] uppercase">
                            VERIFY {report.id?.slice(0, 8).toUpperCase() ?? 'PREVIEW'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500" />
        </div>
    );
}
