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
        courses: { title: string };
        portal_users?: { full_name: string };
    };
}

export function CertificateCard({ cert }: CertificateProps) {
    const certRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);

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

    return (
        <div className="space-y-4">
            <Card 
                ref={certRef}
                className="group relative w-full overflow-hidden border-none shadow-2xl hover:shadow-teal-500/10 transition-all duration-500 bg-slate-950"
                style={{ minHeight: '560px' }}
            >
                {/* Decorative Background Patterns */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full -ml-32 -mb-32 blur-3xl" />

                {/* Golden Border Embellishment */}
                <div className="absolute inset-4 border border-teal-500/20 rounded-xl pointer-events-none" />

                <CardContent className="relative p-10 text-center space-y-6">
                    {/* Header Logo */}
                    <div className="flex justify-center mb-2">
                        <img 
                            src="/images/logo.png" 
                            alt="Rillcod Logo" 
                            className="h-12 w-auto brightness-110 grayscale-0"
                            crossOrigin="anonymous"
                        />
                    </div>

                    <div className="flex justify-center">
                        <div className="p-4 rounded-full bg-teal-500/10 ring-4 ring-teal-500/5">
                            <TrophyIcon className="w-12 h-12 text-teal-400" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Badge variant="outline" className="text-teal-400 border-teal-500/30 uppercase tracking-[0.2em] text-[10px] font-black px-4 py-1 rounded-none bg-teal-500/5">
                            Certificate of Completion
                        </Badge>
                        <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">
                            {cert.courses.title}
                        </h2>
                        <div className="flex items-center justify-center gap-2 text-slate-400 mt-2">
                            <CheckBadgeIcon className="w-4 h-4 text-teal-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 italic">Successfully Validated & Verified</span>
                        </div>
                    </div>

                    <div className="py-4 border-y border-white/5 space-y-1">
                        <p className="text-slate-500 text-[9px] uppercase tracking-[0.3em] font-black">This Honors Award is Granted To</p>
                        <p className="text-3xl font-black text-teal-500 italic uppercase tracking-tight">
                            {cert.portal_users?.full_name || 'Valued Learner'}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-left max-w-sm mx-auto">
                        <div>
                            <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest opacity-50">Issued On</p>
                            <p className="text-white text-xs font-black italic">{format(new Date(cert.issued_date), 'MMMM dd, yyyy')}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest opacity-50">Verify ID</p>
                            <p className="text-white text-xs font-black font-mono tracking-tighter text-teal-500/80">{cert.verification_code}</p>
                        </div>
                    </div>

                    {/* Signature Section */}
                    <div className="pt-6 flex justify-center items-end gap-12 border-t border-white/5 mx-auto max-w-sm">
                        <div className="flex flex-col items-center">
                            <img 
                                src="/images/signature.png" 
                                alt="Signature" 
                                className="h-10 w-auto object-contain brightness-200 contrast-150 mix-blend-screen"
                                crossOrigin="anonymous"
                            />
                            <div className="w-32 h-[1px] bg-white/20 my-1" />
                            <p className="text-[10px] font-black text-white italic">Mr Osahon</p>
                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Director</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-3">
                <button 
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex-1 max-w-[200px] flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-none transition-all shadow-lg shadow-teal-900/40"
                >
                    {isDownloading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
                    {isDownloading ? 'Processing...' : 'Download PDF'}
                </button>
                <button 
                    onClick={handleShare}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest rounded-none border border-slate-700 transition-all"
                >
                    <ShareIcon className="w-4 h-4" /> Share
                </button>
                <a 
                    href={`/verify/${cert.verification_code}`}
                    target="_blank"
                    className="p-3 bg-slate-900 border border-slate-800 text-teal-400 hover:bg-teal-500/10 transition-all rounded-none"
                    title="Verification Page"
                >
                    <QrCodeIcon className="w-5 h-5" />
                </a>
            </div>
        </div>
    );
}
