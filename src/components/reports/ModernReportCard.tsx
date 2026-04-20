// @refresh reset
'use client';

import React from 'react';
import QRCode from 'react-qr-code';
import {
    TrophyIcon,
    UserCircleIcon,
    BoltIcon,
    SparklesIcon,
    CheckBadgeIcon,
    ShieldCheckIcon,
} from '@/lib/icons';
import { cn } from '@/lib/utils';

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
    template_id?: 'futuristic' | 'industrial' | 'executive' | string | null;
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

// WAEC-aligned grade scale (replaces generic A/B/C system)
function waecGrade(score: number): { code: string; label: string; remark: string; color: string } {
    const s = Math.max(0, Math.min(100, Math.round(score)));
    if (s >= 75) return { code: 'A1', label: 'DISTINCTION', remark: 'Excellent — Outstanding performance', color: '#059669' };
    if (s >= 70) return { code: 'B2', label: 'VERY GOOD', remark: 'Very Good — Above average', color: '#0891b2' };
    if (s >= 65) return { code: 'B3', label: 'GOOD', remark: 'Good — Solid understanding', color: '#4f46e5' };
    if (s >= 60) return { code: 'C4', label: 'CREDIT', remark: 'Credit — Satisfactory', color: '#0284c7' };
    if (s >= 55) return { code: 'C5', label: 'CREDIT', remark: 'Credit — Satisfactory', color: '#0284c7' };
    if (s >= 50) return { code: 'C6', label: 'CREDIT', remark: 'Credit — Minimum credit pass', color: '#0369a1' };
    if (s >= 45) return { code: 'D7', label: 'PASS', remark: 'Pass — Below average', color: '#d97706' };
    if (s >= 40) return { code: 'E8', label: 'MARGINAL', remark: 'Marginal Pass — Needs improvement', color: '#ea580c' };
    return { code: 'F9', label: 'FAIL', remark: 'Fail — Must retake', color: '#dc2626' };
}

export default function ModernReportCard({ report, orgSettings }: {
    report: ReportCardData;
    orgSettings: OrgSettings | null;
}) {
    const tid = (report.template_id || 'futuristic') as 'futuristic' | 'industrial' | 'executive';
    const isFuturistic = tid === 'futuristic';
    const isIndustrial = tid === 'industrial';
    const isExecutive = tid === 'executive';

    // ── Org defaults (mirrors ReportCard) ──────────────────────────────
    const org = {
        org_name: orgSettings?.org_name || 'Rillcod Technologies',
        org_tagline: orgSettings?.org_tagline || 'Excellence in Educational Technology',
        org_phone: orgSettings?.org_phone || '08116600091',
        org_email: orgSettings?.org_email || 'support@rillcod.com',
        logo_url: orgSettings?.logo_url || '/logo.png',
    };

    const today = report.report_date
        ? new Date(report.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    // ── WAEC 6-component scoring ─────────────────────────────────────────
    // Theory 20% · Classwork 10% · Practical 25% · Assignments 20% · Attendance 10% · Assessment 15%
    const em = (report.engagement_metrics as any) ?? {};
    const theory = Number(report.theory_score) || 0;   // 20%
    const classwork = Number(em.classwork_score) || 0;   // 10%
    const practical = Number(report.practical_score) || 0;   // 25%
    const assignments = Number(report.attendance_score) || 0;   // 20% (assignment completion %)
    const attendance = Number(report.participation_score) || 0;   // 10% (class attendance %)
    const assessment = Number(em.assessment_score) || 0;   // 15% (mid-term)
    const computed = Math.round(
        theory * 0.20 + classwork * 0.10 + practical * 0.25 +
        assignments * 0.20 + attendance * 0.10 + assessment * 0.15
    );
    const overall = Number(report.overall_score) > 0 ? Number(report.overall_score) : computed;
    const grade = waecGrade(overall);
    const showCertificate = overall >= 45 || report.has_certificate === true;

    const hasPayment = !!report.fee_status;
    const feeStyle = report.fee_status ? FEE_STATUS_STYLE[report.fee_status] : null;

    // ── Theme tokens (all hex — safe for html2canvas) ──────────────────
    const accent = isIndustrial ? '#000000' : isExecutive ? '#C5A059' : '#4f46e5';
    const accentDark = isExecutive ? '#1A1A2E' : accent;
    const accentLight = isIndustrial ? '#f5f5f5' : isExecutive ? '#FFFDF7' : '#eef2ff';
    const panelBorder = isIndustrial ? '2px solid #000000'
        : isExecutive ? '1px solid #C5A059'
            : '1px solid #e0e7ff';
    const radius = isIndustrial || isExecutive ? 0 : 16;
    const radiusSm = isIndustrial || isExecutive ? 0 : 10;
    const radiusPill = isIndustrial ? 0 : 999;

    // ── WAEC 6-component metrics (all hex-safe for html2canvas) ──────────
    const M_INDUST = '#000000';
    const M_EXEC = ['#C5A059', '#1A1A2E', '#C5A059', '#1A1A2E', '#C5A059', '#1A1A2E'];
    const M_FUT = ['#4f46e5', '#06b6d4', '#10b981', '#f97316', '#f59e0b', '#8b5cf6'];
    const metrics = [
        { label: 'Theory / Written', weight: '20%', value: theory, color: isIndustrial ? M_INDUST : isExecutive ? M_EXEC[0] : M_FUT[0] },
        { label: 'Classwork', weight: '10%', value: classwork, color: isIndustrial ? M_INDUST : isExecutive ? M_EXEC[1] : M_FUT[1] },
        { label: 'Practical / Projects', weight: '25%', value: practical, color: isIndustrial ? M_INDUST : isExecutive ? M_EXEC[2] : M_FUT[2] },
        { label: 'Assignments', weight: '20%', value: assignments, color: isIndustrial ? M_INDUST : isExecutive ? M_EXEC[3] : M_FUT[3] },
        { label: 'Attendance', weight: '10%', value: attendance, color: isIndustrial ? M_INDUST : isExecutive ? M_EXEC[4] : M_FUT[4] },
        { label: 'Mid-term Assessment', weight: '15%', value: assessment, color: isIndustrial ? M_INDUST : isExecutive ? M_EXEC[5] : M_FUT[5] },
    ];

    return (
        <div
            id="modern-report-card"
            className={cn('bg-white text-black relative overflow-hidden flex flex-col mx-auto', isIndustrial && 'font-mono')}
            style={{
                width: '210mm', height: '297mm',
                paddingTop: '12mm', paddingLeft: '18mm', paddingRight: '18mm', paddingBottom: '10mm',
                boxSizing: 'border-box',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                fontFamily: isIndustrial ? "'Space Mono', monospace" : 'inherit',
            }}
        >
            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    #modern-report-card { margin: 0 !important; width: 210mm !important; height: 297mm !important; padding-top: 12mm !important; }
                }
            ` }} />

            {/* ── DECORATIVE FRAMES ─────────────────────────────────────────── */}
            {isFuturistic && (
                <>
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 280, height: 280, background: 'radial-gradient(circle, rgba(79,70,229,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', inset: '6mm', border: '1.5px solid rgba(79,70,229,0.15)', borderRadius: 20, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: '4mm', left: '4mm', width: 26, height: 26, borderTop: '3px solid #4f46e5', borderLeft: '3px solid #4f46e5', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', bottom: '4mm', right: '4mm', width: 26, height: 26, borderBottom: '3px solid #4f46e5', borderRight: '3px solid #4f46e5', pointerEvents: 'none' }} />
                </>
            )}
            {isIndustrial && (
                <>
                    <div style={{ position: 'absolute', inset: 0, border: '12px solid #000', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', inset: '9mm', border: '1px solid rgba(0,0,0,0.1)', pointerEvents: 'none' }} />
                </>
            )}
            {isExecutive && (
                <>
                    <div style={{ position: 'absolute', inset: 0, border: '10px solid #1A1A2E', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', inset: '8mm', border: '1px solid #C5A059', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: '5mm', left: '5mm', width: 30, height: 30, borderTop: '3px solid #C5A059', borderLeft: '3px solid #C5A059', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: '5mm', right: '5mm', width: 30, height: 30, borderTop: '3px solid #C5A059', borderRight: '3px solid #C5A059', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', bottom: '5mm', left: '5mm', width: 30, height: 30, borderBottom: '3px solid #C5A059', borderLeft: '3px solid #C5A059', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', bottom: '5mm', right: '5mm', width: 30, height: 30, borderBottom: '3px solid #C5A059', borderRight: '3px solid #C5A059', pointerEvents: 'none' }} />
                </>
            )}

            {/* ── HEADER ───────────────────────────────────────────────────── */}
            <div style={{
                position: 'relative', zIndex: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                paddingBottom: 10, marginBottom: 8,
                borderBottom: isIndustrial ? '4px solid #000' : isExecutive ? '3px solid #C5A059' : '1px solid #e5e7eb',
            }}>
                {/* Left: logo + org */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        padding: 8,
                        background: isIndustrial || isExecutive ? accentDark : '#fff',
                        border: isIndustrial || isExecutive ? 'none' : '1px solid #e5e7eb',
                        borderRadius: radiusSm,
                    }}>
                        <img
                            src={org.logo_url}
                            alt="Logo"
                            crossOrigin="anonymous"
                            style={{ width: 48, height: 48, objectFit: 'contain', filter: (isIndustrial || isExecutive) ? 'brightness(0) invert(1)' : 'none' }}
                            onError={e => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                        />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.04em', fontStyle: 'italic', lineHeight: 1, marginBottom: 4, color: isExecutive ? '#1A1A2E' : '#000' }}>
                            {org.org_name}
                        </h1>
                        <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: accent, marginBottom: 3 }}>
                            {org.org_tagline}
                        </p>
                        <p style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af' }}>
                            {org.org_phone}{org.org_phone && org.org_email ? ' · ' : ''}{org.org_email}
                        </p>
                    </div>
                </div>

                {/* Right: badge + ID + date + fee */}
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <div style={{ padding: '4px 14px', background: accentDark, color: '#fff', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', fontStyle: 'italic', borderRadius: radiusSm }}>
                        Progress Report
                    </div>
                    <p style={{ fontSize: 17, fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.03em', lineHeight: 1, color: isExecutive ? '#1A1A2E' : '#000' }}>
                        {report.id?.slice(0, 8) || 'PREVIEW'}
                    </p>
                    <p style={{ fontSize: 8, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{today}</p>
                    {hasPayment && feeStyle && (
                        <span style={{ padding: '3px 10px', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', color: feeStyle.text, background: feeStyle.bg, borderRadius: radiusPill }}>
                            {feeStyle.label}
                        </span>
                    )}
                </div>
            </div>

            {/* ── MAIN CONTENT — fills remaining height, spreads evenly ───── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 10, minHeight: 0 }}>

                {/* ── IDENTITY GRID ──────────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                    {/* Student panel */}
                    <div style={{ background: accentLight, border: panelBorder, borderRadius: radius, padding: '10px 14px' }}>
                        <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <UserCircleIcon className="w-3 h-3 shrink-0" /> Authorized Recipient
                        </p>
                        <h3 style={{ fontSize: 15, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.15, marginBottom: 8, color: isExecutive ? '#1A1A2E' : '#000' }}>
                            {report.student_name || '—'}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
                            {[
                                { l: 'Class', v: report.section_class },
                                { l: 'School', v: report.school_name },
                                { l: report.school_section === 'school' ? 'Term' : 'Duration', v: report.report_term || report.course_duration },
                                { l: 'Status', v: 'CERTIFIED', green: true },
                            ].map(f => (
                                <div key={f.l}>
                                    <p style={{ fontSize: 7, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 2 }}>{f.l}</p>
                                    <p style={{ fontSize: 11, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: f.green ? '#059669' : (isExecutive ? '#1A1A2E' : '#111827'), lineHeight: 1.2 }}>
                                        {f.v || '—'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Course + module panel */}
                    <div style={{ background: accentLight, border: panelBorder, borderRadius: radius, padding: '10px 14px' }}>
                        <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <ShieldCheckIcon className="w-3 h-3 shrink-0" /> Operational Domain
                        </p>
                        <h3 style={{ fontSize: 15, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.15, marginBottom: 8, color: isExecutive ? '#1A1A2E' : '#000' }}>
                            {report.course_name || '—'}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ background: isIndustrial ? '#f5f5f5' : isExecutive ? '#fff' : '#f1f5f9', border: isIndustrial ? '1px solid #000' : isExecutive ? '1px solid rgba(197,160,89,0.3)' : '1px solid #cbd5e1', borderRadius: radiusSm, padding: '5px 10px' }}>
                                <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#64748b', marginBottom: 2 }}>Current Module</p>
                                <p style={{ fontSize: 11, fontWeight: 700, color: isExecutive ? '#1A1A2E' : '#1e293b', lineHeight: 1.2 }}>{report.current_module || '—'}</p>
                            </div>
                            <div style={{ background: isIndustrial ? '#000' : isExecutive ? '#1A1A2E' : '#ede9fe', border: isIndustrial ? '1px solid #000' : isExecutive ? 'none' : '1px solid #c4b5fd', borderRadius: radiusSm, padding: '5px 10px' }}>
                                <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: isIndustrial ? '#ccc' : isExecutive ? '#C5A059' : '#7c3aed', marginBottom: 2 }}>Upcoming Module</p>
                                <p style={{ fontSize: 11, fontWeight: 700, color: isIndustrial ? '#fff' : isExecutive ? '#C5A059' : '#4c1d95', lineHeight: 1.2 }}>{report.next_module || '—'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── ASSESSMENT MATRIX ──────────────────────────────────────── */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ height: 1, flex: 1, background: isIndustrial ? '#000' : isExecutive ? '#C5A059' : '#e5e7eb' }} />
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5em', fontStyle: 'italic', color: isIndustrial ? '#000' : isExecutive ? '#C5A059' : '#9ca3af', flexShrink: 0 }}>Assessment Matrix</p>
                        <div style={{ height: 1, flex: 1, background: isIndustrial ? '#000' : isExecutive ? '#C5A059' : '#e5e7eb' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 12 }}>
                        {/* Metric bars + qualifier grades */}
                        <div style={{ background: '#fff', border: isIndustrial ? '2px solid #000' : isExecutive ? '1px solid #C5A059' : '1px solid #f3f4f6', borderRadius: isIndustrial ? 0 : isExecutive ? 0 : 18, padding: '12px 14px' }}>
                            {/* Scoring key */}
                            <div style={{ borderBottom: isIndustrial ? '2px solid #000' : '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 9, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 7, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em', marginRight: 4 }}>Key</span>
                                {metrics.map((m, i) => (
                                    <span key={m.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        {i > 0 && <span style={{ color: '#d1d5db', marginRight: 4, fontSize: 7 }}>·</span>}
                                        <span style={{ width: 6, height: 6, borderRadius: isIndustrial ? 0 : '50%', backgroundColor: m.color, display: 'inline-block', marginRight: 3, flexShrink: 0 }} />
                                        <span style={{ fontSize: 7, fontWeight: 800, color: m.color }}>{m.label}</span>
                                        <span style={{ fontSize: 7, fontWeight: 600, color: '#9ca3af', marginLeft: 1 }}>/{m.weight}</span>
                                    </span>
                                ))}
                                <span style={{ fontSize: 7, fontWeight: 700, color: '#6b7280', marginLeft: 4 }}>= 100 pts</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                                {metrics.map(m => (
                                    <div key={m.label}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                            <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af' }}>{m.label} ({m.weight})</span>
                                            <span style={{ fontSize: 13, fontWeight: 900, fontStyle: 'italic', color: isIndustrial ? '#000' : m.color }}>{m.value}%</span>
                                        </div>
                                        <div style={{ height: 5, width: '100%', background: isIndustrial ? '#f5f5f5' : isExecutive ? '#FFF8EC' : '#f8fafc', border: isIndustrial ? '1px solid #000' : '1px solid #f3f4f6', borderRadius: isIndustrial ? 0 : 999, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${m.value}%`, background: m.color, borderRadius: isIndustrial ? 0 : 999 }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, paddingTop: 10, borderTop: isIndustrial ? '2px solid #000' : '1px solid #f3f4f6' }}>
                                {[
                                    { l: 'Practical / Projects', v: report.projects_grade },
                                    { l: 'Assignments', v: report.homework_grade },
                                    { l: 'Classwork', v: report.participation_grade },
                                ].map(g => (
                                    <div key={g.l} style={{ background: accentLight, border: panelBorder, borderRadius: radiusSm, padding: '6px 10px' }}>
                                        <p style={{ fontSize: 7, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 3 }}>{g.l}</p>
                                        <p style={{ fontSize: 11, fontWeight: 900, fontStyle: 'italic', color: isExecutive ? '#1A1A2E' : '#111827', lineHeight: 1.25 }}>{g.v || '—'}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Grade display */}
                        <div style={{
                            background: isIndustrial ? '#000' : isExecutive ? '#1A1A2E' : '#4f46e5',
                            borderRadius: isIndustrial ? 0 : isExecutive ? 0 : 18,
                            padding: 14, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {isExecutive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#C5A059' }} />}
                            <span style={{ color: isExecutive ? '#C5A059' : 'rgba(255,255,255,0.4)', display: 'flex', marginBottom: 2 }}><TrophyIcon className="w-5 h-5" /></span>
                            <p style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', color: isExecutive ? '#C5A059' : 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Grade</p>
                            <h3 style={{ fontSize: 64, fontWeight: 900, fontStyle: 'italic', lineHeight: 1, color: isIndustrial ? '#fff' : isExecutive ? '#C5A059' : '#fff', marginBottom: 4 }}>{grade.code}</h3>
                            <div style={{ padding: '3px 10px', background: isIndustrial ? '#fff' : isExecutive ? '#C5A059' : '#fff', borderRadius: isIndustrial ? 0 : radiusSm, marginBottom: 4 }}>
                                <span style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: isIndustrial ? '#000' : isExecutive ? '#1A1A2E' : '#111827' }}>{grade.label}</span>
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 900, fontStyle: 'italic', color: isExecutive ? 'rgba(197,160,89,0.7)' : 'rgba(255,255,255,0.65)', letterSpacing: '-0.02em' }}>{overall}%</p>
                            <p style={{ fontSize: 6, fontWeight: 700, color: isExecutive ? 'rgba(197,160,89,0.5)' : 'rgba(255,255,255,0.35)', marginTop: 2, textAlign: 'center', letterSpacing: '0.05em' }}>{grade.remark}</p>
                        </div>
                    </div>
                </div>

                {/* ── QUALITATIVE ASSESSMENT — grows to fill remaining space ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1, minHeight: 0 }}>
                    <div style={{ background: isExecutive ? '#FFFDF7' : '#f0fdf4', border: isIndustrial ? '2px solid #000' : isExecutive ? '1px solid #C5A059' : '1px solid #bbf7d0', borderRadius: radius, padding: '10px 14px', display: 'flex', flexDirection: 'column' }}>
                        <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#059669', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4, fontStyle: 'italic' }}>
                            <SparklesIcon className="w-3 h-3 shrink-0" /> Precision Strengths
                        </p>
                        <p style={{ fontSize: 11, lineHeight: 1.55, color: '#166534', fontWeight: 500, fontStyle: 'italic', flex: 1 }}>
                            {report.key_strengths || 'Cognitive patterns indicate high analytical precision and rapid assimilation of core technical logic.'}
                        </p>
                    </div>
                    <div style={{ background: isExecutive ? '#FFFDF7' : '#fff7ed', border: isIndustrial ? '2px solid #000' : isExecutive ? '1px solid #C5A059' : '1px solid #fed7aa', borderRadius: radius, padding: '10px 14px', display: 'flex', flexDirection: 'column' }}>
                        <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#dc2626', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4, fontStyle: 'italic' }}>
                            <BoltIcon className="w-3 h-3 shrink-0" /> Growth Vectors
                        </p>
                        <p style={{ fontSize: 11, lineHeight: 1.55, color: '#7c2d12', fontWeight: 500, fontStyle: 'italic', flex: 1 }}>
                            {report.areas_for_growth || 'Transition to complex architectural modeling is required to optimize deployment competence.'}
                        </p>
                    </div>
                </div>

                {/* ── CERTIFICATION DECREE (conditional) ─────────────────────── */}
                {showCertificate && (
                    <div style={{
                        padding: '9px 14px',
                        background: isIndustrial ? '#fff' : isExecutive ? '#FFFDF7' : '#eef2ff',
                        border: isIndustrial ? '4px double #000' : isExecutive ? '2px solid #C5A059' : '1px solid #c7d2fe',
                        borderRadius: radius, display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        <div style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentDark, borderRadius: radiusSm }}>
                            <span style={{ color: isExecutive ? '#C5A059' : '#fff', display: 'flex' }}><CheckBadgeIcon className="w-5 h-5" /></span>
                        </div>
                        <div>
                            <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', fontStyle: 'italic', opacity: 0.6, color: isExecutive ? '#C5A059' : accent, marginBottom: 3 }}>Official Certification Decree</p>
                            <p style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.45, fontStyle: 'italic', color: '#374151' }}>
                                This document officially recognizes that{' '}
                                <strong style={{ fontStyle: 'normal', color: '#111' }}>{report.student_name}</strong>{' '}
                                has successfully satisfied the rigorous technical requirements of the{' '}
                                <strong style={{ fontStyle: 'normal', color: isExecutive ? '#C5A059' : accent }}>{report.course_name}</strong>{' '}
                                curriculum.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── SIGNATURE & AUTHENTICATION ─────────────────────────────── */}
                <div style={{
                    paddingTop: 10,
                    borderTop: isIndustrial ? '4px solid #000' : isExecutive ? '2px solid #C5A059' : '1px solid #e5e7eb',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
                        {/* Signature block */}
                        <div>
                            <p style={{ fontSize: 8, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Signatory Authority</p>
                            <img
                                src="/images/signature.png"
                                alt="Signature"
                                style={{ height: 38, objectFit: 'contain', mixBlendMode: 'multiply', marginBottom: 3 }}
                            />
                            <div style={{ width: 160, height: isIndustrial ? 2 : 1, background: isExecutive ? '#C5A059' : '#111827', marginBottom: 4 }} />
                            <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', fontStyle: 'italic', color: isExecutive ? '#1A1A2E' : '#111' }}>Director</p>
                            <p style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Rillcod Technologies</p>
                            {report.instructor_name && (
                                <p style={{ fontSize: 8, fontWeight: 900, color: accent, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 2, fontStyle: 'italic' }}>
                                    {report.instructor_name}
                                </p>
                            )}
                        </div>

                        {/* Payment notice (optional) */}
                        {report.show_payment_notice && (
                            <div style={{
                                flex: 1, padding: '8px 12px',
                                background: isIndustrial ? '#fff' : isExecutive ? '#FFFDF7' : '#fffbeb',
                                border: isIndustrial ? '2px solid #000' : isExecutive ? '2px solid #C5A059' : '1.5px solid #fcd34d',
                                borderRadius: isIndustrial ? 0 : isExecutive ? 0 : 12,
                                textAlign: 'center',
                            }}>
                                <p style={{ fontSize: 8, fontWeight: 900, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 3 }}>Next Term Fee Payment</p>
                                <p style={{ fontSize: 14, fontWeight: 900, color: '#78350f', fontStyle: 'italic', marginBottom: 2 }}>₦{report.fee_amount || '20,000'} · RILLCOD LTD</p>
                                <p style={{ fontSize: 12, fontWeight: 900, color: '#78350f' }}>Providus · 7901178957</p>
                            </div>
                        )}

                        {/* QR */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ padding: 8, background: '#fff', border: isIndustrial ? '2px solid #000' : isExecutive ? '1px solid #C5A059' : '1px solid #e5e7eb', borderRadius: isIndustrial ? 0 : isExecutive ? 0 : 14 }}>
                                <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={54} fgColor={isExecutive ? '#1A1A2E' : '#000'} />
                            </div>
                            <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', fontStyle: 'italic', color: accent }}>Verify Secure Hash</p>
                        </div>
                    </div>
                </div>

            </div>{/* end main content */}

            {/* ── FOOTER STRIP ─────────────────────────────────────────────── */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, display: 'flex' }}>
                {isIndustrial ? (
                    <div style={{ flex: 1, background: '#000' }} />
                ) : isExecutive ? (
                    <>
                        <div style={{ flex: 4, background: '#1A1A2E' }} />
                        <div style={{ flex: 1, background: '#C5A059' }} />
                    </>
                ) : (
                    <>
                        <div style={{ flex: 1, background: '#4f46e5' }} />
                        <div style={{ flex: 1, background: '#06b6d4' }} />
                        <div style={{ flex: 1, background: '#10b981' }} />
                        <div style={{ flex: 1, background: '#8b5cf6' }} />
                        <div style={{ flex: 1, background: '#e11d48' }} />
                    </>
                )}
            </div>
        </div>
    );
}
