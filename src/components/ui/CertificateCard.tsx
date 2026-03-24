'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    DownloadCloud, Share2, Printer, Copy, CheckCircle2, 
    Sparkles, Palette, Loader2, Award
} from 'lucide-react';
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

export function CertificateCard({ cert }: CertificateProps) {
    const certRef    = useRef<HTMLDivElement>(null);
    const captureRef = useRef<HTMLDivElement>(null);

    const [isDownloading, setIsDownloading] = useState(false);
    const [isCapturing,   setIsCapturing]   = useState(false);
    const [template, setTemplate]           = useState<TemplateType>('prestige');
    const [toast, setToast]                 = useState<string | null>(null);
    const [copied, setCopied]               = useState(false);

    // 3D Tilt State
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);
    const [isHovering, setIsHovering] = useState(false);

    const showToastMsg = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const handleDownload = async () => {
        if (!certRef.current) return;
        setIsDownloading(true);
        try {
            setIsCapturing(true);
            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
            await new Promise(r => setTimeout(r, 150)); 
            if (!captureRef.current) throw new Error('Capture reference missing');
            const fileName = `Certificate_${cert.courses.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${cert.verification_code}.pdf`;
            await generateReportPDF(captureRef.current, fileName, true);
            showToastMsg('Certificate downloaded successfully!');
        } catch (err) {
            console.error('Certificate PDF generation failed:', err);
            showToastMsg('Download failed. Please try again.');
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
            try { await navigator.clipboard.writeText(url); showToastMsg('Verification link copied!'); } catch { showToastMsg('Link: ' + url); }
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
            setCopied(true); showToastMsg('Certificate number copied!');
            setTimeout(() => setCopied(false), 2000);
        } catch { showToastMsg('Cert #: ' + cert.certificate_number); }
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

    // Mobile Responsiveness Scaling
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const ob = new ResizeObserver((entries) => {
            if (entries[0]) {
                const w = entries[0].contentRect.width;
                setScale(w / 1122);
            }
        });
        if (containerRef.current) ob.observe(containerRef.current);
        return () => ob.disconnect();
    }, []);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateXVal = ((y - centerY) / centerY) * -4;
        const rotateYVal = ((x - centerX) / centerX) * 4;
        setRotateX(rotateXVal);
        setRotateY(rotateYVal);
    };

    const handleMouseLeave = () => {
        setRotateX(0);
        setRotateY(0);
        setIsHovering(false);
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-[#0d0d12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        >
            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-black/90 backdrop-blur-md border border-white/20 text-white text-xs font-bold px-6 py-4 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-3 pointer-events-none"
                    >
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header / Builder Control Area */}
            <div className="bg-gradient-to-b from-[#16161c] to-[#0d0d12] p-6 lg:p-8 border-b border-white/5 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
                
                <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between relative z-10">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <Award className="w-5 h-5 text-emerald-400" />
                            <h3 className="text-xl font-black text-white tracking-tight uppercase italic">{cert.courses.title}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Valid & Verified
                            </span>
                            <span className="w-px h-3 bg-white/20" />
                            <span>ID: {cert.certificate_number}</span>
                        </div>
                    </div>

                    {/* Template Builder Selector */}
                    <div className="w-full lg:w-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <Palette className="w-4 h-4 text-slate-400" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Template Design</p>
                        </div>
                        <div className="flex items-center bg-black/40 border border-white/[0.08] p-1.5 rounded-xl overflow-x-auto custom-scrollbar">
                            {TEMPLATES.map(t => {
                                const isActive = template === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setTemplate(t.id)}
                                        className={`relative px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap rounded-lg flex-shrink-0 ${
                                            isActive ? 'text-white' : 'text-slate-500 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {isActive && (
                                            <motion.div 
                                                layoutId="activeTemplate" 
                                                className="absolute inset-0 bg-white/10 border border-white/20 rounded-lg backdrop-blur-md"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <span className="relative z-10">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3D Certificate Preview Area */}
            <div className="p-4 sm:p-8 lg:p-12 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#111] via-black to-black relative perspective-1000 flex items-center justify-center min-h-[300px] overflow-hidden">
                <div className="absolute inset-0 bg-[url('/images/grid.svg')] bg-center opacity-[0.02]" />

                <motion.div
                    ref={containerRef}
                    onMouseMove={handleMouseMove}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={handleMouseLeave}
                    animate={{ rotateX, rotateY, scale: isHovering ? 1.02 : 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.5 }}
                    className="relative w-full shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 flex items-center justify-center bg-white"
                    style={{ aspectRatio: '1122/794', transformStyle: 'preserve-3d' }}
                >
                    <div 
                        ref={certRef}
                        style={{
                            width: 1122,
                            height: 794,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                            position: 'absolute',
                            top: 0,
                            left: 0
                        }}>
                        <CertificateTemplates {...templateProps} />
                    </div>

                    {/* Holographic overlay */}
                    <AnimatePresence>
                        {isHovering && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 pointer-events-none mix-blend-overlay z-50 overflow-hidden rounded-[inherit]"
                                style={{
                                    background: `linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.4) 25%, transparent 30%)`,
                                    backgroundSize: '200% 200%',
                                    backgroundPosition: `${(rotateY / 5 + 1) * 50}% ${(rotateX / 5 + 1) * 50}%`,
                                }}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* Hidden capture element for ultra-high-res PDF */}
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
                    backgroundColor: '#fff', 
                }}
            >
                <CertificateTemplates {...templateProps} />
            </div>

            {/* Premium Action Bar */}
            <div className="bg-[#111113] border-t border-white/5 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={handleCopyCertNumber}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all group"
                    >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />}
                        {copied ? 'Copied' : 'Copy ID'}
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all group"
                    >
                        <Printer className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                        Print
                    </button>
                    <button
                        onClick={handleShare}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all group"
                    >
                        <Share2 className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                        Share
                    </button>
                </div>

                <div className="w-full sm:w-auto">
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-black text-[11px] font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(249,115,22,0.3)] hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                        {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
                        {isDownloading ? 'Generating PDF...' : 'Download High-Res PDF'}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
