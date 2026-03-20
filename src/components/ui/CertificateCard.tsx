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
            await generateReportPDF(certRef.current, fileName);
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

    return (
        <div className="space-y-8 animate-fade-in group/main">
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

            <Card 
                ref={certRef}
                className={`relative w-full overflow-hidden border-none shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-700 rounded-none ${
                    template === 'vanguard' ? 'bg-[#121212]' : 
                    template === 'academic' ? 'bg-[#fafafa]' : 
                    'bg-[#050505]'
                }`}
                style={{ minHeight: '620px' }}
            >
                {/* ─ VANGUARD TEMPLATE (Modern Sharp) ─────────────────────────── */}
                {template === 'vanguard' && (
                    <>
                        <div className="absolute inset-0 bg-[#121212]" />
                        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 blur-[100px] pointer-events-none" />
                        <div className="absolute inset-0 border-[2px] border-primary/20 pointer-events-none m-4" />
                        <div className="absolute inset-0 border-[1px] border-white/5 pointer-events-none m-8" />
                        
                        {/* Corner Accents */}
                        <div className="absolute top-4 left-4 w-4 h-4 bg-primary" />
                        <div className="absolute top-4 right-4 w-4 h-4 bg-primary" />
                        <div className="absolute bottom-4 left-4 w-4 h-4 bg-primary" />
                        <div className="absolute bottom-4 right-4 w-4 h-4 bg-primary" />
                    </>
                )}

                {/* ─ ACADEMIC TEMPLATE (Classic Sharp) ────────────────────────── */}
                {template === 'academic' && (
                    <>
                        <div className="absolute inset-0 bg-[#fafafa]" />
                        <div className="absolute inset-4 border-[3px] border-[#1e293b] pointer-events-none" />
                        <div className="absolute inset-6 border border-[#1e293b]/10 pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] rotate-12 pointer-events-none">
                            <TrophyIcon className="w-96 h-96 text-[#1e293b]" />
                        </div>
                    </>
                )}

                {/* ─ FUTURE TEMPLATE (High Tech Sharp) ─────────────────────────── */}
                {template === 'future' && (
                    <>
                        <div className="absolute inset-0 bg-[#000]" />
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,145,77,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,145,77,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
                        <div className="absolute top-0 left-0 w-full h-[4px] bg-primary shadow-[0_0_20px_rgba(255,145,77,0.5)]" />
                        <div className="absolute bottom-0 left-0 w-full h-[4px] bg-primary shadow-[0_0_20px_rgba(255,145,77,0.5)]" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 blur-[150px] pointer-events-none" />
                    </>
                )}

                <CardContent className="relative p-16 text-center flex flex-col items-center justify-between h-full space-y-10 z-10">
                    {/* Header Logotype */}
                    <div className="space-y-6">
                        <img 
                            src="/images/logo.png" 
                            alt="Rillcod" 
                            className={`h-16 mx-auto ${template === 'academic' ? 'grayscale brightness-50' : 'brightness-125'}`}
                            crossOrigin="anonymous"
                        />
                        <div className={`text-[11px] font-black uppercase tracking-[0.5em] ${template === 'academic' ? 'text-slate-900 border-t border-b border-black py-2' : 'text-primary'}`}>
                            RILLCOD TECHNOLOGIES &middot; QUANTUM LEARNING
                        </div>
                    </div>

                    {/* Main Title Area */}
                    <div className="space-y-8 flex-1 flex flex-col justify-center">
                        <div className="space-y-3">
                            <h3 className={`text-[12px] font-black uppercase tracking-[0.4em] ${template === 'academic' ? 'text-slate-500 italic font-medium' : 'text-slate-500'}`}>
                                Verified Academic Credential
                            </h3>
                            <h2 className={`text-6xl lg:text-7xl font-black italic tracking-tighter uppercase leading-[0.85] ${
                                template === 'academic' ? 'text-[#1e293b]' : 'text-white'
                            }`}>
                                Certificate <br/> Of <span className="text-primary NOT-italic">Mastery</span>
                            </h2>
                        </div>

                        <div className={`w-32 h-[2px] mx-auto ${template === 'academic' ? 'bg-[#1e293b]' : 'bg-primary/40'}`} />

                        <div className="space-y-4">
                            <p className={`text-[11px] uppercase tracking-[0.4em] font-black ${template === 'academic' ? 'text-slate-600' : 'text-slate-500'}`}>
                                This Record Confirms That
                            </p>
                            <h1 className={`text-5xl lg:text-6xl font-black italic uppercase tracking-tighter leading-none ${
                                template === 'academic' ? 'text-black border-b-[3px] border-primary pb-4 px-12' : 'text-primary drop-shadow-[0_0_15px_rgba(255,145,77,0.3)]'
                            }`}>
                                {studentName}
                            </h1>
                        </div>

                        <div className="space-y-4 pt-4">
                            <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] italic">
                                has established proficiency in the curriculum of
                            </p>
                            <div className="space-y-2">
                                <h4 className={`text-3xl font-black uppercase tracking-tight ${template === 'academic' ? 'text-black' : 'text-white'}`}>
                                    {courseTitle}
                                </h4>
                                <div className="flex items-center justify-center gap-4">
                                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{programName}</span>
                                    <div className="w-1 h-1 bg-slate-700" />
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Class: {studentClass}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Verification & Signatures */}
                    <div className="w-full grid grid-cols-3 items-end gap-12 pt-12">
                        {/* Left: QR Placeholder */}
                        <div className="flex flex-col items-start gap-3">
                            <div className={`p-2 border transition-all ${template === 'academic' ? 'border-slate-900 bg-white' : 'border-primary/30 bg-primary/5 group/qr hover:border-primary'}`}>
                                <QrCodeIcon className={`w-16 h-16 ${template === 'academic' ? 'text-black' : 'text-primary'}`} />
                            </div>
                            <div className="text-left space-y-0.5">
                                <p className="text-[8px] font-black uppercase text-slate-600 tracking-widest">VALIDATION HASH</p>
                                <p className={`text-[10px] font-mono font-black tracking-tighter ${template === 'academic' ? 'text-black' : 'text-white'}`}>{cert.verification_code}</p>
                            </div>
                        </div>

                        {/* Middle/Center: Signature 1 */}
                        <div className="flex flex-col items-center">
                            <div className="relative mb-2">
                                <img src="/images/signature.png" alt="Director" className={`h-16 w-auto ${template === 'vanguard' ? 'invert brightness-[500%]' : template === 'academic' ? 'contrast-200 grayscale' : 'brightness-125'}`} crossOrigin="anonymous" />
                            </div>
                            <div className={`w-full h-[1.5px] mb-3 ${template === 'academic' ? 'bg-black' : 'bg-primary'}`} />
                            <p className={`text-[10px] font-black uppercase tracking-widest ${template === 'academic' ? 'text-black' : 'text-white'}`}>Director General</p>
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">Academic Standards Board</p>
                        </div>

                        {/* Right: Signature 2 */}
                        <div className="flex flex-col items-center">
                            <div className="relative mb-2">
                                <img src="/images/signature.png" alt="Head" className={`h-16 w-auto ${template === 'vanguard' ? 'invert brightness-[500%]' : template === 'academic' ? 'contrast-200 grayscale' : 'brightness-125'}`} crossOrigin="anonymous" />
                            </div>
                            <div className={`w-full h-[1.5px] mb-3 ${template === 'academic' ? 'bg-black' : 'bg-primary'}`} />
                            <p className={`text-[10px] font-black uppercase tracking-widest ${template === 'academic' ? 'text-black' : 'text-white'}`}>Head of Technology</p>
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">Credential Verification Depot</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

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
