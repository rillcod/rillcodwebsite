// @refresh reset
'use client';

import React from 'react';
import QRCode from 'react-qr-code';
import {
    SparklesIcon,
    BoltIcon,
    TrophyIcon,
} from '@/lib/icons';

import { StudentReport, OrgSettings, parseEngagementMetrics } from '@/types/reports';

interface PrintableReportProps {
    report: StudentReport;
    orgSettings?: OrgSettings | null;
}

// WAEC grading scale
const getWAECGrade = (score: number) => {
    const s = Math.max(0, Math.min(100, Math.round(score)));
    if (s >= 75) return { g: 'A1', label: 'DISTINCTION',    color: '#059669' };
    if (s >= 70) return { g: 'B2', label: 'VERY GOOD',      color: '#0891b2' };
    if (s >= 65) return { g: 'B3', label: 'GOOD',           color: '#4f46e5' };
    if (s >= 60) return { g: 'C4', label: 'CREDIT',         color: '#0284c7' };
    if (s >= 55) return { g: 'C5', label: 'CREDIT',         color: '#0369a1' };
    if (s >= 50) return { g: 'C6', label: 'CREDIT',         color: '#0369a1' };
    if (s >= 45) return { g: 'D7', label: 'PASS',           color: '#d97706' };
    if (s >= 40) return { g: 'E8', label: 'MARGINAL PASS',  color: '#ea580c' };
    return              { g: 'F9', label: 'FAIL',           color: '#dc2626' };
};

// Inline-style constants (safe for html2canvas — no oklch)
const C = {
    black:     '#121212',
    accent:    '#FF914D',
    white:     '#ffffff',
    slate50:   '#f8fafc',
    slate100:  '#f1f5f9',
    slate200:  '#e2e8f0',
    slate300:  '#cbd5e1',
    slate400:  '#94a3b8',
    slate600:  '#475569',
    slate900:  '#0f172a',
};

/**
 * A dedicated component for high-fidelity A4 printing.
 * Uses 210mm × 297mm dimensions and inline hex styles for html2canvas compatibility.
 */
export default function PrintableReport({ report, orgSettings }: PrintableReportProps) {
    if (!report) return null;

    const today = report.report_date
        ? new Date(report.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    // WAEC 6-component weighted score
    const theory      = Number(report.theory_score)              || 0; // 20%
    const practical   = Number(report.practical_score)           || 0; // 25%
    const assignments = Number(report.attendance_score)          || 0; // 20% (DB: attendance_score)
    const attendance  = Number(report.participation_score)       || 0; // 10% (DB: participation_score)
    const em = parseEngagementMetrics(report.engagement_metrics);
    const classwork   = Number(em.classwork_score)               || 0; // 10%
    const assessment  = Number(em.assessment_score)              || 0; // 15%

    const computed = Math.round(
        theory * 0.20 + practical * 0.25 + assignments * 0.20 +
        attendance * 0.10 + classwork * 0.10 + assessment * 0.15
    );
    const overall = Number(report.overall_score) || computed;
    const grade = getWAECGrade(overall);

    const metrics = [
        { label: 'Theory (20%)',          value: theory,      bar: C.black  },
        { label: 'Practical (25%)',        value: practical,   bar: C.accent },
        { label: 'Assignments (20%)',      value: assignments, bar: C.black  },
        { label: 'Attendance (10%)',       value: attendance,  bar: C.accent },
        { label: 'Classwork (10%)',        value: classwork,   bar: C.black  },
        { label: 'Mid-Term Assess. (15%)', value: assessment,  bar: C.accent },
    ];

    const hasPayment = report.fee_status && report.fee_status !== 'none';
    const getFeeStyle = (status: string) => {
        const styles: Record<string, { label: string; text: string; bg: string }> = {
            paid:        { label: 'PAID',        text: '#065f46', bg: '#d1fae5' },
            outstanding: { label: 'OUTSTANDING', text: '#991b1b', bg: '#fee2e2' },
            partial:     { label: 'PARTIAL',     text: '#92400e', bg: '#fef3c7' },
            sponsored:   { label: 'SPONSORED',   text: '#1e40af', bg: '#dbeafe' },
            waived:      { label: 'WAIVED',      text: '#5b21b6', bg: '#ede9fe' },
        };
        return styles[status] || null;
    };
    const feeStyle = hasPayment ? getFeeStyle(report.fee_status ?? '') : null;

    return (
        <div
            id="printable-report"
            className="printable-modern"
            style={{
                background: C.white,
                color: C.slate900,
                fontFamily: 'sans-serif',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: '14mm 16mm 12mm 16mm',
                margin: '0 auto',
                overflow: 'hidden',
                width: '210mm',
                height: '297mm',
                minHeight: '297mm',
                boxSizing: 'border-box',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
            }}
        >
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { size: A4 portrait; margin: 8mm; }
                    html, body { margin: 0; padding: 0; width: 100%; height: auto; }
                    .printable-modern {
                        box-shadow: none !important;
                        margin: 0 auto !important;
                        width: 194mm !important;
                        height: auto !important;
                        min-height: 0 !important;
                        max-height: 281mm !important;
                        padding: 10mm !important;
                        overflow: hidden !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .printable-modern * {
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    /* Prevent fixed hero text from spilling outside A4 printable area */
                    .printable-modern h1 { font-size: 24px !important; line-height: 1.05 !important; }
                    .printable-modern h2 { font-size: 38px !important; line-height: 1.05 !important; }
                    .printable-modern h3 { font-size: 56px !important; line-height: 1 !important; }
                }
            ` }} />

            {/* Outer border */}
            <div style={{ position: 'absolute', inset: 0, border: `12px solid ${C.black}`, pointerEvents: 'none' }} />
            {/* Inner border */}
            <div style={{ position: 'absolute', inset: '32px', border: `1px solid ${C.slate200}`, pointerEvents: 'none' }} />

            {/* Header */}
            <div style={{
                position: 'relative', zIndex: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                borderBottom: `4px solid ${C.black}`, paddingBottom: '16px', marginBottom: '16px',
            }}>
                <div style={{ display: 'flex', gap: '32px' }}>
                    <div style={{ padding: '12px', background: C.black }}>
                        <img
                            src={orgSettings?.logo_url || '/logo.png'}
                            alt="Logo"
                            crossOrigin="anonymous"
                            style={{ width: '48px', height: '48px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                            onError={e => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <h1 style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.04em', fontStyle: 'italic', lineHeight: 1, marginBottom: '4px', color: C.black }}>
                            {orgSettings?.org_name || 'Rillcod Technologies'}
                        </h1>
                        <p style={{ fontSize: '10px', color: C.accent, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', marginBottom: '8px' }}>
                            {orgSettings?.org_tagline || 'Excellence in Educational Technology'}
                        </p>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '10px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                            <span>ID: {report.id?.slice(0, 8) || 'PREVIEW'}</span>
                            <div style={{ width: '6px', height: '6px', background: C.slate200, borderRadius: '50%', marginTop: '6px' }} />
                            <span>DATE: {today}</span>
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px' }}>
                    <div style={{ padding: '10px 32px', background: C.black, color: C.white, fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', fontStyle: 'italic' }}>
                        Progress Report
                    </div>
                    {hasPayment && feeStyle && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 20px', background: C.slate50, border: `1px solid ${C.slate200}` }}>
                            <span style={{ fontSize: '10px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.1em' }}>STATUS: {feeStyle.label}</span>
                            {report.fee_amount && <span style={{ fontSize: '14px', fontWeight: 900, fontStyle: 'italic', color: C.black }}>₦{report.fee_amount}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Student Identity */}
            <div style={{ position: 'relative', zIndex: 10, marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '3px', background: C.accent }} />
                    <p style={{ fontSize: '11px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.5em', fontStyle: 'italic' }}>Student</p>
                </div>
                <h2 style={{ fontSize: '36px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em', fontStyle: 'italic', borderBottom: `4px solid ${C.accent}`, paddingBottom: '10px', lineHeight: 1, color: C.black }}>
                    {report.student_name || 'Valued Learner'}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', paddingTop: '12px' }}>
                    {[
                        { label: 'Programme',      value: report.course_name    || 'STEM Synthesis' },
                        { label: 'Term',        value: report.report_term    || 'S1-2024'        },
                        { label: 'Class',  value: report.section_class  || 'N/A'            },
                        { label: 'School',     value: report.school_name    || 'Rillcod'        },
                    ].map(f => (
                        <div key={f.label}>
                            <p style={{ fontSize: '10px', fontWeight: 900, color: C.slate300, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '6px' }}>{f.label}</p>
                            <p style={{ fontSize: '13px', fontWeight: 900, color: C.black, textTransform: 'uppercase', fontStyle: 'italic', lineHeight: 1.2 }}>{f.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Performance Hub */}
            <div style={{ position: 'relative', zIndex: 10, display: 'grid', gridTemplateColumns: '8fr 4fr', gap: '20px', marginBottom: '14px' }}>
                {/* Metric Bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h3 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6em', color: C.black, fontStyle: 'italic', whiteSpace: 'nowrap' }}>Performance Breakdown</h3>
                        <div style={{ height: '2px', width: '100%', background: C.slate100 }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '32px', rowGap: '16px' }}>
                        {metrics.map(m => (
                            <div key={m.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{m.label}</span>
                                    <span style={{ fontSize: '15px', fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: C.black }}>{m.value}%</span>
                                </div>
                                <div style={{ height: '8px', width: '100%', background: C.slate50, border: `1px solid ${C.slate100}` }}>
                                    <div style={{ height: '100%', width: `${m.value}%`, background: m.bar }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '10px', borderTop: `2px solid ${C.slate100}` }}>
                        <div style={{ padding: '16px', background: C.slate50, borderLeft: `6px solid ${C.black}` }}>
                            <p style={{ fontSize: '9px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Project Work</p>
                            <p style={{ fontSize: '18px', fontWeight: 900, color: C.black, textTransform: 'uppercase', fontStyle: 'italic', lineHeight: 1 }}>{report.projects_grade || 'OPTIMAL'}</p>
                        </div>
                        <div style={{ padding: '16px', background: C.slate50, borderLeft: `6px solid ${C.accent}` }}>
                            <p style={{ fontSize: '9px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Homework</p>
                            <p style={{ fontSize: '18px', fontWeight: 900, color: C.black, textTransform: 'uppercase', fontStyle: 'italic', lineHeight: 1 }}>{report.homework_grade || 'SUBMITTED'}</p>
                        </div>
                    </div>
                </div>

                {/* Grade Badge */}
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', background: C.black, padding: '32px 16px',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.4)', position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '5px', background: C.accent }} />
                    <p style={{ fontSize: '10px', fontWeight: 900, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.5em', marginBottom: '16px', fontStyle: 'italic' }}>WAEC Grade</p>
                    <h3 style={{ fontSize: '80px', fontWeight: 900, fontStyle: 'italic', lineHeight: 1, color: grade.color, letterSpacing: '-0.03em', marginBottom: '16px' }}>{grade.g}</h3>
                    <div style={{ padding: '8px 24px', background: C.accent, color: C.black, fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em' }}>
                        {grade.label}
                    </div>
                    <p style={{ fontSize: '20px', fontWeight: 900, color: 'rgba(255,255,255,0.2)', marginTop: '16px', fontVariantNumeric: 'tabular-nums' }}>SCORE: {overall}%</p>
                </div>
            </div>

            {/* Qualitative Insights */}
            <div style={{ position: 'relative', zIndex: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div style={{ padding: '14px', background: C.slate50, border: `1px solid ${C.slate200}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: 'rgba(255,145,77,0.1)', border: `1px solid rgba(255,145,77,0.2)` }}>
                            <SparklesIcon style={{ width: '18px', height: '18px', color: C.accent }} />
                        </div>
                        <h4 style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: C.black, fontStyle: 'italic' }}>Identified Strengths</h4>
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, color: C.slate600, fontWeight: 700, fontStyle: 'italic' }}>
                        {report.key_strengths || 'The student demonstrates exceptional aptitude in problem-solving and practical work.'}
                    </p>
                </div>
                <div style={{ padding: '14px', background: C.slate50, border: `1px solid ${C.slate200}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: 'rgba(18,18,18,0.05)', border: `1px solid rgba(18,18,18,0.1)` }}>
                            <BoltIcon style={{ width: '18px', height: '18px', color: C.black }} />
                        </div>
                        <h4 style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: C.black, fontStyle: 'italic' }}>Areas for Improvement</h4>
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, color: C.slate600, fontWeight: 700, fontStyle: 'italic' }}>
                        {report.areas_for_growth || 'Focus on continued practice and revision will strengthen overall performance.'}
                    </p>
                </div>
            </div>

            {/* Certification Decree */}
            {(overall >= 45 || report.has_certificate) && (
                <div style={{ position: 'relative', zIndex: 10, marginBottom: '10px', padding: '12px 16px', background: C.white, borderTop: `4px solid ${C.black}`, borderBottom: `4px solid ${C.black}`, display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <TrophyIcon style={{ width: '40px', height: '40px', color: C.accent, flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: '9px', fontWeight: 900, color: C.slate300, textTransform: 'uppercase', letterSpacing: '1.2em', marginBottom: '6px', fontStyle: 'italic' }}>Certificate of Achievement</p>
                        <p style={{ fontSize: '14px', fontWeight: 900, color: C.black, lineHeight: 1.4, fontStyle: 'italic' }}>
                            {report.certificate_text || `This document officially recognizes the mastery demonstrated by ${report.student_name} in ${report.course_name}.`}
                        </p>
                    </div>
                </div>
            )}

            {/* Signature · Payment Details · QR */}
            <div style={{ position: 'relative', zIndex: 10, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, paddingTop: '14px', borderTop: `2px solid ${C.slate100}` }}>

                {/* Left — single signature */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                    <p style={{ fontSize: '8px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Signatory Authority</p>
                    <img src="/images/signature.png" alt="Official Signature" crossOrigin="anonymous" style={{ height: '40px', margin: '0 auto 8px', opacity: 0.85, filter: 'contrast(1.25)', mixBlendMode: 'multiply' }} />
                    <div style={{ width: '160px', height: '2.5px', background: C.black, margin: '0 auto 6px' }} />
                    <p style={{ fontSize: '12px', fontWeight: 900, color: C.black, textTransform: 'uppercase', fontStyle: 'italic' }}>Director</p>
                    <p style={{ fontSize: '9px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rillcod Technologies</p>
                </div>

                {/* Centre — bank account details (conditional) */}
                {report.show_payment_notice && (
                    <div style={{ flex: 1, background: C.white, border: `2px solid ${C.black}`, padding: '10px 16px', textAlign: 'center', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <p style={{ fontSize: '8px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.18em' }}>School Fees Payment Account</p>
                        <p style={{ fontSize: '15px', fontWeight: 900, color: C.black, letterSpacing: '0.05em' }}>Providus Bank &nbsp;·&nbsp; <span style={{ fontFamily: 'monospace' }}>7901178957</span></p>
                        <p style={{ fontSize: '13px', fontWeight: 900, color: C.black }}>RILLCOD LTD</p>
                        <p style={{ fontSize: '8px', fontWeight: 700, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Use student name as reference &nbsp;·&nbsp; Send proof to admin</p>
                    </div>
                )}

                {/* Right — QR */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <div style={{ padding: '12px', background: C.white, border: `1px solid ${C.slate200}` }}>
                        <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8) || 'preview'}`} size={64} fgColor={C.black} />
                    </div>
                    <p style={{ fontSize: '9px', fontWeight: 900, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.4em' }}>Verify Online</p>
                </div>
            </div>

            {/* Footer color bar */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20px', display: 'flex' }}>
                <div style={{ flex: 4, background: C.black }} />
                <div style={{ flex: 1, background: C.accent }} />
                <div style={{ flex: 0.5, background: C.slate300 }} />
            </div>
        </div>
    );
}
