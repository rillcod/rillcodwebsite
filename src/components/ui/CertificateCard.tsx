'use client';

import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
    ArrowDownTrayIcon, ShareIcon, TrophyIcon,
    CheckBadgeIcon, QrCodeIcon, ArrowPathIcon
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

type TemplateType = 'vanguard' | 'academic' | 'future';

export function CertificateCard({ cert }: CertificateProps) {
    const certRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [template, setTemplate] = useState<TemplateType>('vanguard');

    const handleDownload = async () => {
        if (!certRef.current) return;
        setIsDownloading(true);
        try {
            const fileName = `Certificate_${cert.courses.title.replace(/\s+/g, '_')}_${cert.verification_code}.pdf`;
            await generateReportPDF(certRef.current, fileName, true);
        } catch (error) {
            console.error('Download failed:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleShare = async () => {
        const url = `https://rillcod.com/verify/${cert.verification_code}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Certificate: ${cert.courses.title}`,
                    text: `I just earned a certificate for ${cert.courses.title} at Rillcod Academy!`,
                    url
                });
            } catch (err) {
                console.error('Share failed:', err);
            }
        } else {
            await navigator.clipboard.writeText(url);
            alert('Verification link copied to clipboard!');
        }
    };

    const studentName = cert.portal_users?.full_name || 'Valued Learner';
    const courseTitle = cert.courses.title;
    const programName = cert.courses.program?.name || 'STEM Advancement Program';
    const studentClass = cert.portal_users?.section_class || cert.portal_users?.grade_level || 'N/A';
    const issuedDate = cert.issued_date
        ? new Date(cert.issued_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';

    return (
        <div className="space-y-6 animate-fade-in group/main">
            {/* Template Selector */}
            <div className="flex justify-center gap-0 bg-[#111113] border border-white/[0.05] p-1 w-fit mx-auto shadow-xl">
                {(['vanguard', 'academic', 'future'] as TemplateType[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTemplate(t)}
                        className={`px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
                            template === t
                            ? 'bg-primary text-black'
                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* ── Certificate Card — A4 Landscape proportions ────────────────── */}
            <div
                ref={certRef}
                className={`relative w-full overflow-hidden rounded-none border-none shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-700 ${
                    template === 'vanguard' ? 'bg-[#121212]' :
                    template === 'academic' ? 'bg-[#fafafa]' :
                    'bg-[#050505]'
                }`}
                style={{ aspectRatio: '297/210', width: '100%' }}
            >
                {/* ─ VANGUARD TEMPLATE ─────────────────────────────────────── */}
                {template === 'vanguard' && (
                    <>
                        <div className="absolute inset-0 bg-[#121212]" />
                        <div className="absolute top-0 right-0 w-[350px] h-[350px] bg-primary/5 blur-[100px] pointer-events-none" />
                        <div className="absolute inset-0 border-[2px] border-primary/20 pointer-events-none m-3" />
                        <div className="absolute inset-0 border-[1px] border-white/5 pointer-events-none m-6" />
                        <div className="absolute top-3 left-3 w-3 h-3 bg-primary" />
                        <div className="absolute top-3 right-3 w-3 h-3 bg-primary" />
                        <div className="absolute bottom-3 left-3 w-3 h-3 bg-primary" />
                        <div className="absolute bottom-3 right-3 w-3 h-3 bg-primary" />
                    </>
                )}

                {/* ─ ACADEMIC TEMPLATE ─────────────────────────────────────── */}
                {template === 'academic' && (
                    <>
                        <div className="absolute inset-0 bg-[#fafafa]" />
                        <div className="absolute inset-3 border-[3px] border-[#1e293b] pointer-events-none" />
                        <div className="absolute inset-5 border border-[#1e293b]/10 pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] rotate-12 pointer-events-none">
                            <TrophyIcon className="w-80 h-80 text-[#1e293b]" />
                        </div>
                    </>
                )}

                {/* ─ FUTURE TEMPLATE ───────────────────────────────────────── */}
                {template === 'future' && (
                    <>
                        <div className="absolute inset-0 bg-[#000]" />
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,145,77,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,145,77,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
                        <div className="absolute top-0 left-0 w-full h-[3px] bg-primary shadow-[0_0_20px_rgba(255,145,77,0.5)]" />
                        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-primary shadow-[0_0_20px_rgba(255,145,77,0.5)]" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[150px] pointer-events-none" />
                    </>
                )}

                {/* ── Two-column landscape layout ──────────────────────────── */}
                <div className="relative z-10 flex h-full" style={{ padding: '5%' }}>

                    {/* LEFT PANEL — branding + QR */}
                    <div className="flex flex-col items-center justify-between" style={{ width: '28%', paddingRight: '3%' }}>
                        {/* Logo */}
                        <div className="flex flex-col items-center gap-1.5">
                            <img
                                src="/images/logo.png"
                                alt="Rillcod"
                                className={`w-auto mx-auto ${template === 'academic' ? 'grayscale brightness-50' : 'brightness-125'}`}
                                style={{ height: 'clamp(28px, 6%, 48px)' }}
                                crossOrigin="anonymous"
                            />
                            <div className={`text-center font-black uppercase leading-tight ${template === 'academic' ? 'text-slate-900 border-t border-b border-black py-1' : 'text-primary'}`}
                                style={{ fontSize: 'clamp(5px, 0.9%, 8px)', letterSpacing: '0.3em' }}>
                                RILLCOD TECHNOLOGIES &middot; QUANTUM LEARNING
                            </div>
                        </div>

                        {/* Center badge */}
                        <div className="flex flex-col items-center gap-1">
                            <CheckBadgeIcon className={`${template === 'academic' ? 'text-[#1e293b]' : 'text-primary'}`}
                                style={{ width: 'clamp(28px, 8%, 48px)', height: 'clamp(28px, 8%, 48px)' }} />
                            <div className={`font-black uppercase text-center ${template === 'academic' ? 'text-slate-700' : 'text-slate-400'}`}
                                style={{ fontSize: 'clamp(5px, 0.85%, 7px)', letterSpacing: '0.15em' }}>
                                VERIFIED CREDENTIAL
                            </div>
                        </div>

                        {/* QR + cert number */}
                        <div className="flex flex-col items-center gap-1">
                            <div className={`p-1 border ${template === 'academic' ? 'border-slate-900 bg-white' : 'border-primary/30 bg-primary/5'}`}>
                                <QrCodeIcon className={`${template === 'academic' ? 'text-black' : 'text-primary'}`}
                                    style={{ width: 'clamp(28px, 7%, 44px)', height: 'clamp(28px, 7%, 44px)' }} />
                            </div>
                            <div className={`font-mono font-black text-center break-all ${template === 'academic' ? 'text-black' : 'text-white'}`}
                                style={{ fontSize: 'clamp(5px, 0.75%, 7px)' }}>
                                {cert.verification_code}
                            </div>
                            {issuedDate && (
                                <div className={`font-black uppercase text-center ${template === 'academic' ? 'text-slate-500' : 'text-slate-500'}`}
                                    style={{ fontSize: 'clamp(5px, 0.75%, 7px)', letterSpacing: '0.1em' }}>
                                    {issuedDate}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* VERTICAL DIVIDER */}
                    <div className={`self-stretch w-px flex-shrink-0 ${template === 'academic' ? 'bg-[#1e293b]/20' : 'bg-primary/20'}`} />

                    {/* RIGHT PANEL — certificate content */}
                    <div className="flex flex-col justify-between flex-1 min-w-0" style={{ paddingLeft: '4%' }}>

                        {/* Title block */}
                        <div>
                            <div className={`font-black uppercase ${template === 'academic' ? 'text-slate-500 italic font-medium' : 'text-slate-500'}`}
                                style={{ fontSize: 'clamp(5px, 0.9%, 8px)', letterSpacing: '0.3em' }}>
                                Verified Academic Credential
                            </div>
                            <h2 className={`font-black italic tracking-tighter uppercase leading-none mt-1 ${
                                template === 'academic' ? 'text-[#1e293b]' : 'text-white'
                            }`} style={{ fontSize: 'clamp(16px, 5%, 36px)' }}>
                                Certificate <span className={template !== 'academic' ? 'text-primary' : ''}>Of Mastery</span>
                            </h2>
                            <div className={`mt-1.5 ${template === 'academic' ? 'bg-[#1e293b]' : 'bg-primary/40'}`}
                                style={{ height: '2px', width: 'clamp(32px, 8%, 64px)' }} />
                        </div>

                        {/* Recipient */}
                        <div>
                            <div className={`font-black uppercase ${template === 'academic' ? 'text-slate-600' : 'text-slate-500'}`}
                                style={{ fontSize: 'clamp(5px, 0.85%, 7px)', letterSpacing: '0.3em' }}>
                                This Record Confirms That
                            </div>
                            <h1 className={`font-black italic uppercase tracking-tighter leading-none break-words mt-1 ${
                                template === 'academic'
                                    ? 'text-black border-b-[2px] border-primary pb-1'
                                    : 'text-primary drop-shadow-[0_0_15px_rgba(255,145,77,0.3)]'
                            }`} style={{ fontSize: 'clamp(14px, 4.2%, 30px)' }}>
                                {studentName}
                            </h1>
                        </div>

                        {/* Course info */}
                        <div>
                            <div className="font-black text-slate-500 uppercase italic"
                                style={{ fontSize: 'clamp(5px, 0.8%, 7px)', letterSpacing: '0.2em' }}>
                                has established proficiency in the curriculum of
                            </div>
                            <h4 className={`font-black uppercase tracking-tight break-words mt-1 ${template === 'academic' ? 'text-black' : 'text-white'}`}
                                style={{ fontSize: 'clamp(10px, 2.4%, 18px)' }}>
                                {courseTitle}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="font-black text-primary uppercase" style={{ fontSize: 'clamp(5px, 0.8%, 7px)', letterSpacing: '0.15em' }}>{programName}</span>
                                <div className="w-1 h-1 bg-slate-700" />
                                <span className="font-black text-slate-500 uppercase" style={{ fontSize: 'clamp(5px, 0.8%, 7px)', letterSpacing: '0.15em' }}>Class: {studentClass}</span>
                            </div>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { title: 'Director General', sub: 'Academic Standards Board' },
                                { title: 'Head of Technology', sub: 'Credential Verification Depot' },
                            ].map(({ title, sub }) => (
                                <div key={title} className="flex flex-col items-center">
                                    <img
                                        src="/images/signature.png"
                                        alt={title}
                                        className={`w-auto mb-1 ${template === 'vanguard' ? 'invert brightness-[500%]' : template === 'academic' ? 'contrast-200 grayscale' : 'brightness-125'}`}
                                        style={{ height: 'clamp(16px, 4%, 28px)' }}
                                        crossOrigin="anonymous"
                                        onError={e => (e.currentTarget.style.display = 'none')}
                                    />
                                    <div className={`w-full mb-1 ${template === 'academic' ? 'bg-black' : 'bg-primary'}`} style={{ height: '1.5px' }} />
                                    <div className={`font-black uppercase text-center ${template === 'academic' ? 'text-black' : 'text-white'}`}
                                        style={{ fontSize: 'clamp(5px, 0.8%, 7px)', letterSpacing: '0.12em' }}>
                                        {title}
                                    </div>
                                    <div className="font-black text-slate-600 uppercase text-center"
                                        style={{ fontSize: 'clamp(4px, 0.7%, 6px)', letterSpacing: '0.1em' }}>
                                        {sub}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-center gap-4">
                <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex-1 max-w-[280px] flex items-center justify-center gap-4 py-5 bg-primary hover:bg-primary/90 disabled:opacity-30 text-black text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-[0_10px_40px_rgba(255,145,77,0.2)] hover:-translate-y-1 active:translate-y-0"
                >
                    {isDownloading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <ArrowDownTrayIcon className="w-6 h-6" />}
                    {isDownloading ? 'ENCRYPTING...' : 'Download Record'}
                </button>
                <button
                    onClick={handleShare}
                    className="px-8 py-5 bg-[#111113] border border-white/[0.1] hover:border-white/20 text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all hover:bg-white/[0.02]"
                >
                    System Share
                </button>
            </div>
        </div>
    );
}
