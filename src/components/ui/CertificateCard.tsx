'use client';

import React, { useRef, useState } from 'react';
import {
    ArrowDownTrayIcon, ShareIcon, TrophyIcon,
    CheckBadgeIcon, ArrowPathIcon, ClipboardIcon, CheckIcon
} from '@/lib/icons';
import { generateReportPDF } from '@/lib/pdf-utils';

interface CertificateProps {
    cert: {
        id: string;
        certificate_number: string;
        verification_code: string;
        issued_date: string;
        courses: {
            title: string;
            program?: { name: string };
        };
        portal_users?: {
            full_name: string;
            section_class?: string;
            grade_level?: string;
        };
    };
}

type TemplateType = 'prestige' | 'royal' | 'tech';

const TEMPLATES: { id: TemplateType; label: string }[] = [
    { id: 'prestige', label: 'Prestige' },
    { id: 'royal',   label: 'Royal' },
    { id: 'tech',    label: 'Tech' },
];

// ── Shared template renderer ──────────────────────────────────────────────────
// Used in both the visible responsive div and the hidden fixed-size capture div.
function CertificateTemplates({
    template, studentName, courseTitle, programName,
    studentClass, issuedDate, certCode, certNum,
}: {
    template: TemplateType;
    studentName: string;
    courseTitle: string;
    programName: string;
    studentClass: string;
    issuedDate: string;
    certCode: string;
    certNum: string;
}) {
    return (
        <>
            {/* ════ PRESTIGE TEMPLATE ════════════════════════════════════════ */}
            {template === 'prestige' && (
                <div className="absolute inset-0 flex" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0f0c29 100%)' }}>
                    {/* Decorative side strip */}
                    <div style={{ width: '4px', background: 'linear-gradient(to bottom, #FF914D, #ff6b1a, #FF914D)', flexShrink: 0 }} />

                    {/* Left panel */}
                    <div className="flex flex-col items-center justify-between py-[6%] px-[3%]" style={{ width: '26%', borderRight: '1px solid rgba(255,145,77,0.18)' }}>
                        <div className="flex flex-col items-center gap-2">
                            <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                style={{ height: 'clamp(32px, 7%, 52px)', width: 'auto' }}
                                onError={e => (e.currentTarget.style.display = 'none')} />
                            <div style={{ height: '1px', width: '60%', background: 'rgba(255,145,77,0.3)' }} />
                            <p style={{ fontSize: 'clamp(5px, 1%, 8px)', color: '#FF914D', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', textAlign: 'center', lineHeight: 1.4 }}>
                                Rillcod Technologies
                            </p>
                        </div>

                        <div className="flex flex-col items-center gap-1.5">
                            <div style={{ width: 'clamp(32px, 8%, 52px)', height: 'clamp(32px, 8%, 52px)', background: 'rgba(255,145,77,0.1)', border: '1px solid rgba(255,145,77,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                                <span style={{ padding: '20%', display: 'flex', color: '#FF914D' }}><CheckBadgeIcon className="w-full h-full" /></span>
                            </div>
                            <p style={{ fontSize: 'clamp(4px, 0.8%, 7px)', color: 'rgba(255,145,77,0.6)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}>
                                Verified Credential
                            </p>
                        </div>

                        <div className="flex flex-col items-center gap-1.5">
                            <div style={{ padding: '6px', border: '1px solid rgba(255,145,77,0.3)', background: 'rgba(255,145,77,0.05)' }}>
                                <div style={{ width: 'clamp(28px, 7%, 44px)', height: 'clamp(28px, 7%, 44px)', background: 'rgba(255,145,77,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 'clamp(8px, 1.5%, 12px)', fontWeight: 900, color: '#FF914D' }}>QR</span>
                                </div>
                            </div>
                            <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', wordBreak: 'break-all' }}>
                                {certCode}
                            </p>
                            <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(255,145,77,0.4)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                                rillcod.com/verify
                            </p>
                        </div>
                    </div>

                    {/* Right panel */}
                    <div className="flex flex-col justify-between flex-1 py-[6%] px-[5%]">
                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.9%, 8px)', color: 'rgba(255,145,77,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.35em' }}>
                                Rillcod Technologies · Official Award
                            </p>
                            <h2 style={{ fontSize: 'clamp(20px, 5.5%, 40px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, marginTop: '2%' }}>
                                Certificate <span style={{ color: '#FF914D' }}>Of Mastery</span>
                            </h2>
                            <div style={{ width: 'clamp(40px, 10%, 80px)', height: '2px', background: 'linear-gradient(to right, #FF914D, transparent)', marginTop: '1.5%' }} />
                        </div>

                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.85%, 7px)', color: 'rgba(255,255,255,0.3)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em' }}>
                                This Certifies That
                            </p>
                            <h1 style={{ fontSize: 'clamp(16px, 4.2%, 32px)', fontWeight: 900, color: '#FF914D', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: '1%', textShadow: '0 0 30px rgba(255,145,77,0.3)' }}>
                                {studentName}
                            </h1>
                            {studentClass && (
                                <p style={{ fontSize: 'clamp(4px, 0.8%, 7px)', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '0.5%' }}>
                                    {studentClass}
                                </p>
                            )}
                        </div>

                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.25)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontStyle: 'italic' }}>
                                has successfully completed
                            </p>
                            <h3 style={{ fontSize: 'clamp(11px, 2.6%, 20px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '0.8%', lineHeight: 1.2 }}>
                                {courseTitle}
                            </h3>
                            <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', color: '#FF914D', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.5%' }}>
                                {programName}
                            </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                            {[
                                { name: 'Mr Osahon', role: 'Director, Rillcod Technologies' },
                                { name: 'Head of Academics', role: 'Curriculum & Standards Board' },
                            ].map(sig => (
                                <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                    <img src="/images/signature.png" alt={sig.name} crossOrigin="anonymous"
                                        style={{ height: 'clamp(16px, 4%, 30px)', width: 'auto', filter: 'brightness(500%) invert(1)' }}
                                        onError={e => (e.currentTarget.style.display = 'none')} />
                                    <div style={{ width: 'clamp(60px, 15%, 100px)', height: '1.5px', background: 'rgba(255,145,77,0.4)' }} />
                                    <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'white', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sig.name}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>{sig.role}</p>
                                </div>
                            ))}
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(255,145,77,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Date Issued</p>
                                <p style={{ fontSize: 'clamp(6px, 1%, 9px)', color: 'rgba(255,255,255,0.7)', fontWeight: 900 }}>{issuedDate}</p>
                                <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginTop: 2 }}>{certNum}</p>
                            </div>
                        </div>
                    </div>

                    {/* Right side strip */}
                    <div style={{ width: '4px', background: 'linear-gradient(to bottom, #FF914D, #ff6b1a, #FF914D)', flexShrink: 0 }} />
                </div>
            )}

            {/* ════ ROYAL TEMPLATE ════════════════════════════════════════════ */}
            {template === 'royal' && (
                <div className="absolute inset-0 flex" style={{ background: '#faf7f0' }}>
                    <div style={{ position: 'absolute', inset: '8px', border: '3px solid #1e293b', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', inset: '12px', border: '1px solid rgba(30,41,59,0.12)', pointerEvents: 'none' }} />
                    {[['top-2 left-2', ''], ['top-2 right-2', 'rotate-90'], ['bottom-2 left-2', '-rotate-90'], ['bottom-2 right-2', 'rotate-180']].map(([pos, rot], i) => (
                        <div key={i} className={`absolute ${pos} ${rot} w-5 h-5`} style={{ background: '#1e293b' }} />
                    ))}

                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.04, pointerEvents: 'none' }}>
                        <span style={{ color: '#1e293b', display: 'flex' }}><TrophyIcon className="w-48 h-48" /></span>
                    </div>

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7% 8%', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5%' }}>
                            <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                style={{ height: 'clamp(24px, 5.5%, 40px)', width: 'auto', filter: 'grayscale(1) brightness(0.2)' }}
                                onError={e => (e.currentTarget.style.display = 'none')} />
                            <p style={{ fontSize: 'clamp(5px, 0.85%, 8px)', color: '#475569', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em' }}>
                                Rillcod Technologies · Est. Excellence
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5%', width: '100%' }}>
                                <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
                                <div style={{ width: 6, height: 6, background: '#1e293b', transform: 'rotate(45deg)', flexShrink: 0 }} />
                                <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
                            </div>
                        </div>

                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.9%, 8px)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.35em', fontStyle: 'italic' }}>
                                Be it known to all that
                            </p>
                            <h2 style={{ fontSize: 'clamp(18px, 5%, 38px)', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, marginTop: '1%' }}>
                                Certificate of Achievement
                            </h2>
                        </div>

                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', fontStyle: 'italic' }}>
                                is hereby awarded to
                            </p>
                            <h1 style={{ fontSize: 'clamp(18px, 4.5%, 34px)', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: '0.8%', borderBottom: '2.5px solid #FF914D', paddingBottom: '1%' }}>
                                {studentName}
                            </h1>
                            <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '1%', fontStyle: 'italic' }}>
                                for successfully completing · <strong>{courseTitle}</strong> · {programName}
                            </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }}>
                            {[
                                { name: 'Mr Osahon', role: 'Director' },
                                { name: 'Head of Academics', role: 'Curriculum Board' },
                            ].map(sig => (
                                <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <img src="/images/signature.png" alt={sig.name} crossOrigin="anonymous"
                                        style={{ height: 'clamp(16px, 3.5%, 28px)', width: 'auto', filter: 'contrast(200%) grayscale(1)' }}
                                        onError={e => (e.currentTarget.style.display = 'none')} />
                                    <div style={{ width: 'clamp(50px, 12%, 90px)', height: '1.5px', background: '#1e293b' }} />
                                    <p style={{ fontSize: 'clamp(5px, 0.75%, 7px)', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{sig.name}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sig.role}</p>
                                </div>
                            ))}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ padding: '4px', border: '1px solid #1e293b', marginBottom: 4, display: 'inline-block' }}>
                                    <div style={{ width: 'clamp(24px, 5%, 36px)', height: 'clamp(24px, 5%, 36px)', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: 'clamp(6px, 1.2%, 10px)', fontWeight: 900, color: '#475569' }}>QR</span>
                                    </div>
                                </div>
                                <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{issuedDate}</p>
                                <p style={{ fontSize: 'clamp(4px, 0.6%, 5px)', color: '#cbd5e1', fontFamily: 'monospace' }}>{certCode}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ TECH TEMPLATE ═════════════════════════════════════════════ */}
            {template === 'tech' && (
                <div className="absolute inset-0" style={{ background: '#000' }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,145,77,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,145,77,0.04) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(to right, transparent, #FF914D, transparent)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(to right, transparent, #FF914D, transparent)' }} />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(255,145,77,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100%' }}>
                        <div style={{ width: '22%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '6% 3%', borderRight: '1px solid rgba(255,145,77,0.15)' }}>
                            <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                style={{ height: 'clamp(28px, 6.5%, 48px)', width: 'auto', filter: 'brightness(130%)' }}
                                onError={e => (e.currentTarget.style.display = 'none')} />

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 'clamp(24px, 5%, 36px)', height: 'clamp(24px, 5%, 36px)', border: '1.5px solid rgba(255,145,77,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ width: '80%', height: '80%', display: 'flex', color: '#FF914D' }}><CheckBadgeIcon className="w-full h-full" /></span>
                                </div>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 6.5px)', color: 'rgba(255,145,77,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}>
                                    Auth.<br />Verified
                                </p>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: 'clamp(24px, 5.5%, 40px)', height: 'clamp(24px, 5.5%, 40px)', border: '1px solid rgba(255,145,77,0.25)', background: 'rgba(255,145,77,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                                    <span style={{ fontSize: 'clamp(7px, 1.4%, 11px)', color: '#FF914D', fontWeight: 900 }}>QR</span>
                                </div>
                                <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{certCode}</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '6% 5%' }}>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.9%, 8px)', color: 'rgba(255,145,77,0.4)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', fontFamily: 'monospace' }}>
                                    // Rillcod · Verified Digital Credential
                                </p>
                                <h2 style={{ fontSize: 'clamp(22px, 5.8%, 42px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 0.95, marginTop: '1.5%' }}>
                                    Certificate<br /><span style={{ color: '#FF914D' }}>Of Mastery_</span>
                                </h2>
                            </div>

                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', fontFamily: 'monospace' }}>
                                    &gt; RECIPIENT:
                                </p>
                                <h1 style={{ fontSize: 'clamp(14px, 4%, 30px)', fontWeight: 900, color: '#FF914D', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1, marginTop: '0.8%', textShadow: '0 0 40px rgba(255,145,77,0.25)' }}>
                                    {studentName}
                                </h1>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 6.5px)', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginTop: '0.5%' }}>
                                    &gt; MODULE: {courseTitle} · {programName}
                                </p>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                {[
                                    { name: 'Mr Osahon', role: 'Director' },
                                    { name: 'Head of Academics', role: 'Curriculum Board' },
                                ].map(sig => (
                                    <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                        <img src="/images/signature.png" alt={sig.name} crossOrigin="anonymous"
                                            style={{ height: 'clamp(14px, 3.5%, 26px)', width: 'auto', filter: 'brightness(500%) invert(1)' }}
                                            onError={e => (e.currentTarget.style.display = 'none')} />
                                        <div style={{ width: 'clamp(48px, 12%, 90px)', height: '1px', background: 'rgba(255,145,77,0.35)' }} />
                                        <p style={{ fontSize: 'clamp(5px, 0.75%, 6.5px)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sig.name}</p>
                                        <p style={{ fontSize: 'clamp(4px, 0.6%, 5.5px)', color: 'rgba(255,145,77,0.35)', fontWeight: 700, textTransform: 'uppercase' }}>{sig.role}</p>
                                    </div>
                                ))}
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(255,145,77,0.4)', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                        DATE_ISSUED
                                    </p>
                                    <p style={{ fontSize: 'clamp(6px, 1%, 9px)', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontWeight: 700 }}>{issuedDate}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 5.5px)', color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', marginTop: 2 }}>{certNum}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ── Main card component ───────────────────────────────────────────────────────
export function CertificateCard({ cert }: CertificateProps) {
    const certRef    = useRef<HTMLDivElement>(null); // visible responsive preview
    const captureRef = useRef<HTMLDivElement>(null); // hidden fixed-size capture target

    const [isDownloading, setIsDownloading] = useState(false);
    const [template, setTemplate]           = useState<TemplateType>('prestige');
    const [toast, setToast]                 = useState<string | null>(null);
    const [copied, setCopied]               = useState(false);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Always capture from the hidden fixed-size div — no style manipulation needed
    const handleDownload = async () => {
        if (!captureRef.current) return;
        setIsDownloading(true);
        try {
            const fileName = `Certificate_${cert.courses.title.replace(/\s+/g, '_')}_${cert.verification_code}.pdf`;
            await generateReportPDF(captureRef.current, fileName, true);
        } catch { /* ignore */ } finally {
            setIsDownloading(false);
        }
    };

    const handleShare = async () => {
        const url = `https://rillcod.com/verify/${cert.verification_code}`;
        if (navigator.share) {
            try { await navigator.share({ title: `Certificate: ${cert.courses.title}`, url }); } catch { /* cancelled */ }
        } else {
            try { await navigator.clipboard.writeText(url); showToast('Verification link copied!'); } catch { showToast('Link: ' + url); }
        }
    };

    const handleCopyCertNumber = async () => {
        try {
            await navigator.clipboard.writeText(cert.certificate_number);
            setCopied(true); showToast('Certificate number copied!');
            setTimeout(() => setCopied(false), 2000);
        } catch { showToast('Cert #: ' + cert.certificate_number); }
    };

    const templateProps = {
        template,
        studentName:  cert.portal_users?.full_name || 'Valued Learner',
        courseTitle:  cert.courses.title,
        programName:  cert.courses.program?.name || 'STEM Advancement Programme',
        studentClass: cert.portal_users?.section_class || cert.portal_users?.grade_level || '',
        issuedDate:   cert.issued_date
            ? new Date(cert.issued_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
            : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        certCode: cert.verification_code,
        certNum:  cert.certificate_number,
    };

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Toast */}
            {toast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a2e] border border-white/10 text-white text-xs font-semibold px-5 py-3 shadow-2xl flex items-center gap-2 pointer-events-none">
                    <CheckIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {toast}
                </div>
            )}

            {/* Template switcher */}
            <div className="flex justify-center">
                <div className="flex gap-0 bg-black/40 border border-white/[0.08] p-1">
                    {TEMPLATES.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTemplate(t.id)}
                            className={`px-5 py-2 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
                                template === t.id ? 'bg-primary text-black' : 'text-slate-500 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Visible responsive preview ── */}
            <div
                ref={certRef}
                className="relative overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.6)]"
                style={{ width: '100%', aspectRatio: '794/561' }}
            >
                <CertificateTemplates {...templateProps} />
            </div>

            {/* ── Hidden fixed-size capture area (1122×794 = A4 landscape @ 96dpi) ── */}
            <div
                ref={captureRef}
                aria-hidden="true"
                style={{
                    position: 'fixed', left: -9999, top: 0,
                    width: 1122, height: 794,
                    overflow: 'hidden', pointerEvents: 'none', zIndex: -1,
                }}
            >
                <CertificateTemplates {...templateProps} />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-0.5">Certificate Number</p>
                    <p className="text-xs font-mono font-bold text-slate-400">{templateProps.certNum}</p>
                </div>
                <button
                    onClick={handleCopyCertNumber}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all"
                >
                    {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy #'}
                </button>
            </div>

            <div className="flex items-center justify-center gap-4">
                <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex-1 max-w-[280px] flex items-center justify-center gap-4 py-5 bg-primary hover:bg-primary/90 disabled:opacity-30 text-black text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-[0_10px_40px_rgba(255,145,77,0.2)] hover:-translate-y-1 active:translate-y-0"
                >
                    {isDownloading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <ArrowDownTrayIcon className="w-6 h-6" />}
                    {isDownloading ? 'Generating...' : 'Download PDF'}
                </button>
                <button
                    onClick={handleShare}
                    className="px-8 py-5 bg-[#111113] border border-white/[0.1] hover:border-white/20 text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all hover:bg-white/[0.02]"
                >
                    <ShareIcon className="w-4 h-4 mx-auto mb-1" />
                    Share
                </button>
            </div>
        </div>
    );
}
