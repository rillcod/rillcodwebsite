'use client';

import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
    ArrowDownTrayIcon, ShareIcon, TrophyIcon, 
    CheckBadgeIcon, QrCodeIcon, ArrowPathIcon 
} from '@/lib/icons';
import { format } from 'date-fns';
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
        <div className="space-y-6">
            {/* Template Selector */}
            <div className="flex justify-center gap-2 p-1 bg-slate-900/50 border border-slate-800 rounded-none w-fit mx-auto">
                {(['vanguard', 'academic', 'future'] as TemplateType[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTemplate(t)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${template === t ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <Card 
                ref={certRef}
                className={`group relative w-full overflow-hidden border-none shadow-2xl transition-all duration-700 ${
                    template === 'vanguard' ? 'bg-slate-950' : 
                    template === 'academic' ? 'bg-[#fcfbf7]' : 
                    'bg-[#020617]'
                }`}
                style={{ minHeight: '620px' }}
            >
                {/* ─ VANGUARD TEMPLATE ────────────────────────────────────────── */}
                {template === 'vanguard' && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full -ml-32 -mb-32 blur-3xl" />
                        <div className="absolute inset-6 border border-teal-500/20 rounded-none pointer-events-none" />
                        <div className="absolute inset-8 border border-white/5 rounded-none pointer-events-none" />
                    </>
                )}

                {/* ─ ACADEMIC TEMPLATE ────────────────────────────────────────── */}
                {template === 'academic' && (
                    <>
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                        <div className="absolute inset-6 border-4 border-[#1e293b] pointer-events-none" />
                        <div className="absolute inset-8 border border-[#1e293b]/20 pointer-events-none" />
                        {/* Corner Ornaments */}
                        {[0, 90, 180, 270].map(deg => (
                            <div key={deg} className="absolute w-12 h-12 border-t-4 border-l-4 border-[#1e293b]" style={{ top: deg < 180 ? '24px' : 'auto', bottom: deg >= 180 ? '24px' : 'auto', left: (deg === 0 || deg === 270) ? '24px' : 'auto', right: (deg === 90 || deg === 180) ? '24px' : 'auto', transform: `rotate(${deg}deg)` }} />
                        ))}
                    </>
                )}

                {/* ─ FUTURE TEMPLATE ───────────────────────────────────────────── */}
                {template === 'future' && (
                    <>
                        <div className="absolute inset-0 bg-[url(/images/grid.svg)] opacity-20 pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.1),transparent_70%)]" />
                        <div className="absolute inset-0 border-[20px] border-teal-500/5 pointer-events-none" />
                        <div className="absolute top-0 left-0 w-full h-1 bg-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.5)]" />
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.5)]" />
                    </>
                )}

                <CardContent className="relative p-12 text-center flex flex-col items-center justify-between h-full space-y-8">
                    {/* Header Logotype */}
                    <div className="space-y-4">
                        <img 
                            src="/images/logo.png" 
                            alt="Rillcod" 
                            className={`h-12 mx-auto ${template === 'academic' ? 'brightness-50' : 'brightness-125'}`}
                            crossOrigin="anonymous"
                        />
                        <div className={`text-[10px] font-black uppercase tracking-[0.4em] ${template === 'academic' ? 'text-slate-800' : 'text-teal-500'}`}>
                            RILLCODE TECHNOLOGIES &middot; STEM ACADEMY
                        </div>
                    </div>

                    {/* Main Title Area */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h3 className={`text-[11px] font-black uppercase tracking-[0.3em] ${template === 'academic' ? 'text-slate-500 italic' : 'text-slate-400'}`}>
                                Institutional Honors & Certification
                            </h3>
                            <h2 className={`text-5xl font-black italic tracking-tighter uppercase leading-none ${
                                template === 'academic' ? 'text-[#1e293b]' : 'text-white'
                            }`}>
                                Certificate of <span className="text-teal-500">Completion</span>
                            </h2>
                        </div>

                        <div className={`w-24 h-[1px] mx-auto ${template === 'academic' ? 'bg-slate-300' : 'bg-white/10'}`} />

                        <div className="space-y-2">
                            <p className={`text-[10px] uppercase tracking-[0.3em] font-black ${template === 'academic' ? 'text-slate-500' : 'text-slate-400'}`}>
                                This is to certify that
                            </p>
                            <h1 className={`text-4xl font-black italic uppercase tracking-tight ${
                                template === 'academic' ? 'text-[#1e293b] border-b-2 border-teal-500 pb-2' : 'text-teal-400'
                            }`}>
                                {studentName}
                            </h1>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
                                has successfully completed mastery of
                            </p>
                            <div>
                                <h4 className={`text-2xl font-black uppercase ${template === 'academic' ? 'text-slate-800' : 'text-white'}`}>
                                    {courseTitle}
                                </h4>
                                <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] mt-1">
                                    {programName} &bull; CLASS: {studentClass}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Verification & Signatures */}
                    <div className="w-full grid grid-cols-3 items-end gap-4 pt-8">
                        {/* Left: QR Placeholder */}
                        <div className="flex flex-col items-start gap-2 h-full justify-end">
                            <div className={`p-1 border ${template === 'academic' ? 'border-slate-300 bg-white' : 'border-white/10 bg-slate-900/50'}`}>
                                <QrCodeIcon className={`w-14 h-14 ${template === 'academic' ? 'text-slate-800' : 'text-teal-500 opacity-80'}`} />
                            </div>
                            <div className="text-left">
                                <p className="text-[7px] font-black uppercase text-slate-500 tracking-widest">Verify ID</p>
                                <p className={`text-[9px] font-mono font-black ${template === 'academic' ? 'text-slate-800' : 'text-white'}`}>{cert.verification_code}</p>
                            </div>
                        </div>

                        {/* Middle/Center: Signature 1 */}
                        <div className="flex flex-col items-center">
                            <img src="/images/signature.png" alt="Director" className={`h-12 w-auto mb-1 ${template === 'vanguard' ? 'brightness-[100]' : 'contrast-125'}`} crossOrigin="anonymous" />
                            <div className={`w-full h-[1.5px] mb-2 ${template === 'academic' ? 'bg-slate-800' : 'bg-teal-500'}`} />
                            <p className={`text-[9px] font-black uppercase ${template === 'academic' ? 'text-slate-800' : 'text-white'}`}>Director, STEM Studies</p>
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Rillcod Technologies</p>
                        </div>

                        {/* Right: Signature 2 */}
                        <div className="flex flex-col items-center">
                            <img src="/images/signature.png" alt="Head" className={`h-12 w-auto mb-1 opacity-80 ${template === 'vanguard' ? 'brightness-[100]' : 'contrast-125'}`} crossOrigin="anonymous" />
                            <div className={`w-full h-[1.5px] mb-2 ${template === 'academic' ? 'bg-slate-800' : 'bg-teal-500'}`} />
                            <p className={`text-[9px] font-black uppercase ${template === 'academic' ? 'text-slate-800' : 'text-white'}`}>Academic Head</p>
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Quality Assurance</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-3">
                <button 
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex-1 max-w-[240px] flex items-center justify-center gap-3 py-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-teal-900/40"
                >
                    {isDownloading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-5 h-5 shadow-lg" />}
                    {isDownloading ? 'SYNCHRONIZING...' : 'Official Download'}
                </button>
                <button 
                    onClick={handleShare}
                    className="px-6 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] font-black border border-slate-800 tracking-widest transition-all"
                >
                    SHARE MASTER
                </button>
            </div>
        </div>
    );
}
