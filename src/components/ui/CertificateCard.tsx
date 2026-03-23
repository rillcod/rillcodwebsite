'use client';

import React, { useRef, useState } from 'react';
import {
    ArrowDownTrayIcon, ShareIcon, TrophyIcon,
    CheckBadgeIcon, ArrowPathIcon, ClipboardIcon, CheckIcon, PrinterIcon
} from '@/lib/icons';
import { generateReportPDF } from '@/lib/pdf-utils';
import { toast as showToast } from 'react-hot-toast';
import { CertificateTemplates, TEMPLATES, type TemplateType } from '../certificates/shared/CertificateTemplates';

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



// ── Main card component ───────────────────────────────────────────────────────
export function CertificateCard({ cert }: CertificateProps) {
    const certRef    = useRef<HTMLDivElement>(null);
    const captureRef = useRef<HTMLDivElement>(null);

    const [isDownloading, setIsDownloading] = useState(false);
    const [isCapturing,   setIsCapturing]   = useState(false);
    const [template, setTemplate]           = useState<TemplateType>('prestige');
    const [toast, setToast]                 = useState<string | null>(null);
    const [copied, setCopied]               = useState(false);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const handleDownload = async () => {
        if (!certRef.current) return;
        setIsDownloading(true);

        try {
            // 1. Move into viewport to ensure GPU rasterization
            setIsCapturing(true);

            // 2. Wait for stable layout + extra beat for image stabilization
            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
            await new Promise(r => setTimeout(r, 150)); // Extra 150ms for good measure

            if (!captureRef.current) throw new Error('Capture reference missing');

            const fileName = `Certificate_${cert.courses.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${cert.verification_code}.pdf`;
            await generateReportPDF(captureRef.current, fileName, true);
        } catch (err) {
            console.error('Certificate PDF generation failed:', err);
            showToast('Download failed. Please try again.');
        } finally {
            setIsCapturing(false);
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

    const handlePrint = () => {
        const style = document.createElement('style');
        style.id = '__cert-landscape-print';
        style.textContent = '@page { size: A4 landscape; margin: 0; }';
        document.head.appendChild(style);
        document.body.setAttribute('data-printing', 'certificate');
        window.print();
        setTimeout(() => {
            document.getElementById('__cert-landscape-print')?.remove();
            document.body.removeAttribute('data-printing');
        }, 500);
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
                <div className="flex flex-wrap gap-px bg-black/40 border border-white/[0.08] p-1">
                    {TEMPLATES.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTemplate(t.id)}
                            className={`px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
                                template === t.id ? 'bg-primary text-black' : 'text-slate-500 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Visible responsive preview */}
            <div
                ref={certRef}
                className="relative overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.6)]"
                style={{ width: '100%', aspectRatio: '794/561' }}
            >
                <CertificateTemplates {...templateProps} />
            </div>

            <div
                id="cert-print-root"
                ref={captureRef}
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    left: (isCapturing || (typeof document !== 'undefined' && document.body.getAttribute('data-printing') === 'certificate')) ? 0 : -9999,
                    top: 0,
                    width: 1122,
                    height: 794,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    zIndex: (isCapturing || (typeof document !== 'undefined' && document.body.getAttribute('data-printing') === 'certificate')) ? 9999 : -1,
                    backgroundColor: '#fff', // Safety net for transparent backgrounds
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
                    className="flex-1 py-5 bg-[#111113] border border-white/[0.1] hover:border-white/20 text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all hover:bg-white/[0.02]"
                >
                    <ShareIcon className="w-4 h-4 mx-auto mb-1" />
                    Share
                </button>
                <button
                    onClick={handlePrint}
                    className="flex-1 py-5 bg-[#111113] border border-white/[0.1] hover:border-white/20 text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all hover:bg-white/[0.02]"
                >
                    <PrinterIcon className="w-4 h-4 mx-auto mb-1" />
                    Print
                </button>
            </div>
        </div>
    );
}
