'use client';

import React from 'react';
import QRCode from 'react-qr-code';
import NextImage from 'next/image';
import { cn } from '@/lib/utils';

export interface CertificatePreviewProps {
    studentName?: string | null;
    schoolName?: string | null;
    courseTitle?: string | null;
    programName?: string | null;
    issuedDate?: string | null;
    certificateNumber?: string | null;
    verificationCode?: string | null;
    templateId?: string | null;
    isLandscape?: boolean;
}

export default function CertificatePreview({
    studentName = 'Recipient Name',
    schoolName = 'Rillcod Academy',
    courseTitle = 'Course Title',
    programName = 'Program Name',
    issuedDate = new Date().toISOString(),
    certificateNumber = 'XXXX-XXXX-XXXX',
    verificationCode = 'XXXXXX',
    templateId = 'modern-sharp',
    isLandscape = true
}: CertificatePreviewProps) {
    const today = issuedDate 
        ? new Date(issuedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    const containerStyle = isLandscape 
        ? { width: '297mm', height: '210mm' } 
        : { width: '210mm', height: '297mm' };

    return (
        <div 
            id="certificate-preview-container"
            className={cn(
                "relative bg-white overflow-hidden shadow-2xl"
            )}
            style={{ 
                ...containerStyle
            }}
        >
            {/* THE MODERN SHARP (DEFAULT) */}
            {(!templateId || templateId === 'modern-sharp') && (
                <div className="w-full h-full bg-white relative flex flex-col p-16 border-[20px] border-slate-900 overflow-hidden">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-48 h-48 bg-slate-900 rotate-45 translate-x-24 -translate-y-24" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary rotate-45 -translate-x-12 translate-y-12" />
                    
                    <div className="flex justify-between items-start mb-8">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 bg-white flex items-center justify-center p-2 shadow-sm border border-slate-100">
                                <NextImage src="/images/logo.png" alt="Logo" width={48} height={48} className="object-contain" />
                            </div>
                            <div className="h-12 w-[2px] bg-slate-900 hidden sm:block" />
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tighter text-slate-900">Rillcod <span className="text-primary">Technologies.</span></h3>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Electronic Research Node</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400 mb-1">Authenticated ID</p>
                            <p className="text-sm font-black text-slate-900 font-mono tracking-widest">{certificateNumber}</p>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                        <div className="space-y-2">
                            <h4 className="text-[12px] font-black uppercase tracking-[0.8em] text-slate-400">Certificate of Specialization</h4>
                            <div className="w-12 h-0.5 bg-primary mx-auto" />
                        </div>
                        
                        <div className="space-y-2">
                            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.2em]">This is to certify that</p>
                            <h2 className="text-5xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{studentName || 'RECIPIENT NAME'}</h2>
                        </div>
                        
                        <div className="space-y-3 pt-4">
                            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.2em]">has successfully fulfilled requirements for</p>
                            <div className="bg-slate-900 text-white px-8 py-4">
                                <h1 className="text-2xl font-black uppercase italic tracking-tighter">{courseTitle || 'COURSE TITLE'}</h1>
                                <p className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/80 mt-1">{programName || 'PROGRAM TRACK'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer Signature & QR */}
                    <div className="flex justify-between items-end mt-12 pt-8 border-t border-slate-100">
                        <div className="flex flex-col items-start gap-4">
                            <div className="relative">
                                <NextImage src="/images/signature.png" alt="Signature" width={140} height={50} className="brightness-0 contrast-125" />
                                <div className="absolute inset-0 bg-cyan-500/10 mix-blend-multiply" />
                            </div>
                            <div>
                                <div className="w-48 h-[1px] bg-slate-900 mb-2" />
                                <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 leading-none">Director of Rillcod Technologies</p>
                                <p className="text-[8px] text-slate-400 uppercase tracking-widest mt-1">Institutional Seal of Authorization</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <div className="p-2 bg-white border border-slate-100">
                                <QRCode value={`https://rillcod.com/verify/${verificationCode}`} size={80} />
                            </div>
                            <div className="text-center">
                                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-400 mb-1 leading-none">Registry Hash</p>
                                <p className="text-[10px] font-bold text-slate-900 font-mono tracking-widest leading-none">{verificationCode}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CLASSIC HERITAGE TEMPLATE */}
            {templateId === 'classic-heritage' && (
                <div className="w-full h-full bg-[#FCFBF8] relative flex flex-col p-16 border-[24px] border-double border-[#8C7B5C] overflow-hidden">
                    <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-[#8C7B5C]" />
                    <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-[#8C7B5C]" />
                    <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-[#8C7B5C]" />
                    <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-[#8C7B5C]" />

                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
                        <div className="space-y-3">
                            <NextImage src="/images/logo.png" alt="Seal" width={80} height={80} className="mx-auto" />
                            <h1 className="text-xl font-serif italic text-[#8C7B5C]">Rillcod Educational Technologies</h1>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-4xl font-serif text-[#2C2416]">Certificate of Excellence</h2>
                            <p className="text-lg italic text-slate-600">This parchment awards the title of Master of Technology to</p>
                            <h3 className="text-5xl font-serif font-black underline decoration-1 decoration-[#8C7B5C] underline-offset-8 text-[#1A1610]">{studentName}</h3>
                            <p className="text-lg italic text-slate-600">For outstanding proficiency and completion of</p>
                            <h4 className="text-3xl font-serif font-bold text-[#8C7B5C]">{courseTitle}</h4>
                        </div>

                        <div className="flex justify-between w-full pt-12">
                            <div className="flex flex-col items-center">
                                <NextImage src="/images/signature.png" alt="Signature" width={160} height={60} className="sepia brightness-50" />
                                <div className="w-48 h-[1px] bg-[#8C7B5C]/50 mb-2" />
                                <p className="text-[10px] uppercase tracking-widest font-black text-[#8C7B5C]">Director of Rillcod Technologies</p>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="p-1.5 border border-[#8C7B5C]/30">
                                    <QRCode value={`https://rillcod.com/verify/${verificationCode}`} size={70} />
                                </div>
                                <p className="text-[9px] mt-2 uppercase tracking-widest font-bold font-mono text-[#8C7B5C]">Hash: {verificationCode}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CYBER MINIMAL TEMPLATE */}
            {templateId === 'cyber-minimal' && (
                <div className="w-full h-full bg-slate-50 relative flex flex-col overflow-hidden font-mono text-slate-900 border-[1px] border-slate-200">
                    <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '32px 32px'}} />
                    
                    <div className="relative flex-1 flex flex-col p-16">
                        <div className="flex justify-between items-start mb-12">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white flex items-center justify-center border border-slate-200">
                                    <NextImage src="/images/logo.png" alt="Logo" width={32} height={32} className="object-contain" />
                                </div>
                                <div className="h-8 w-[1px] bg-slate-300" />
                                <div>
                                    <p className="text-[10px] font-black tracking-widest uppercase">Rillcod Technologies</p>
                                    <p className="text-[8px] font-bold opacity-40 uppercase tracking-widest">System.CERT_AUTH_V2</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase opacity-40">Serial_ID</p>
                                <p className="text-xs font-black tracking-tighter italic">#{certificateNumber}</p>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center space-y-10">
                            <div className="space-y-1">
                                <p className="text-[10px] tracking-widest uppercase font-bold text-slate-400">Identity.validate(PASS)</p>
                                <h1 className="text-5xl font-black uppercase tracking-tighter leading-none">{studentName}</h1>
                            </div>

                            <div className="w-1/2 h-[1px] bg-slate-200" />

                            <div className="space-y-4">
                                <p className="text-[10px] tracking-[0.5em] text-primary font-black uppercase leading-none">Module.complete(SUCCESS)</p>
                                <h2 className="text-4xl font-black uppercase italic leading-none">{courseTitle}</h2>
                                <div className="h-0.5 bg-slate-900 w-full" />
                            </div>
                        </div>

                        <div className="flex justify-between items-end border-t border-slate-200 pt-12">
                            <div className="space-y-4">
                                <NextImage src="/images/signature.png" alt="Auth" width={140} height={50} className="grayscale brightness-0" />
                                <div>
                                    <div className="w-48 h-[1px] bg-slate-900 mb-2 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">Director of Rillcod Technologies</p>
                                    <p className="text-[8px] tracking-tighter uppercase font-medium opacity-30 mt-1">Authorized_Digital_Signature_Token</p>
                                </div>
                            </div>
                            <div className="flex gap-10 items-end">
                                <div className="text-right space-y-1">
                                    <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest leading-none">Auth_Key</p>
                                    <p className="text-[11px] font-black tracking-tighter leading-none font-mono">{verificationCode}</p>
                                </div>
                                <div className="p-1 bg-white border border-slate-200">
                                    <QRCode value={`https://rillcod.com/verify/${verificationCode}`} size={70} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* EXECUTIVE PLATINUM TEMPLATE */}
            {templateId === 'executive-platinum' && (
                <div className="w-full h-full bg-[#111] relative flex flex-col p-20 overflow-hidden text-white">
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/[0.03] to-transparent pointer-events-none" />
                    <div className="absolute top-10 left-10 w-32 h-32 border-t border-l border-white/20" />
                    <div className="absolute bottom-10 right-10 w-32 h-32 border-b border-r border-white/20" />
                    
                    <div className="flex justify-between items-center mb-16 relative z-10">
                        <div className="flex items-center gap-6">
                            <div className="p-3 bg-white">
                                <NextImage src="/images/logo.png" alt="Logo" width={48} height={48} className="object-contain" />
                            </div>
                            <div className="h-10 w-[1px] bg-white/20" />
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-[0.2em]">Rillcod <span className="text-white/40 italic">Academy</span></h3>
                                <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/30">Executive Training Division</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-1 leading-none">Record Verification</p>
                            <p className="text-sm font-black text-white font-mono tracking-widest leading-none">{certificateNumber}</p>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center space-y-12 relative z-10">
                        <div className="space-y-4">
                            <p className="text-sm font-black uppercase tracking-[0.8em] text-white/40 leading-none">Professional Credential</p>
                            <h2 className="text-7xl font-black uppercase italic tracking-tighter leading-none bg-gradient-to-r from-white via-white to-white/40 bg-clip-text text-transparent">
                                {studentName}
                            </h2>
                        </div>

                        <div className="space-y-6 max-w-2xl">
                            <p className="text-lg font-medium text-white/60 leading-relaxed italic border-l-2 border-white/20 pl-8">
                                Having demonstrated exceptional mastery and technical proficiency in the specialized domain of {courseTitle}, this official credential is hereby conferred.
                            </p>
                            <div className="inline-flex px-6 py-2 bg-white text-black text-[11px] font-black uppercase tracking-[0.3em]">
                                Verified Graduate • {programName}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-end mt-16 pt-10 border-t border-white/10 relative z-10">
                        <div className="flex items-center gap-12">
                            <div className="space-y-4">
                                <div className="relative">
                                    <NextImage src="/images/signature.png" alt="Signature" width={160} height={60} className="invert brightness-0" />
                                    <div className="absolute inset-0 bg-white/5 mix-blend-overlay" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-white leading-none mb-1">Director of Rillcod Technologies</p>
                                    <p className="text-[9px] text-white/30 uppercase tracking-widest leading-none">Corporate Authorization</p>
                                </div>
                            </div>
                            <div className="h-16 w-[1px] bg-white/10" />
                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-none">Dated</p>
                                <p className="text-[12px] font-bold uppercase text-white leading-none">{today}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="text-right space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 leading-none">Security Hash</p>
                                <p className="text-[11px] font-black tracking-widest text-white font-mono leading-none">{verificationCode}</p>
                            </div>
                            <div className="p-2 bg-white">
                                <QRCode value={`https://rillcod.com/verify/${verificationCode}`} size={80} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ROYAL DIPLOMA TEMPLATE */}
            {templateId === 'royal-diploma' && (
                <div className="w-full h-full bg-[#0F172A] relative flex flex-col p-16 overflow-hidden">
                    {/* Background Texture & Borders */}
                    <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    <div className="absolute inset-8 border-[2px] border-[#D4AF37] pointer-events-none" />
                    <div className="absolute inset-10 border-[1px] border-[#D4AF37]/40 pointer-events-none" />
                    
                    {/* Corner Ornaments */}
                    <div className="absolute top-6 left-6 w-16 h-16 border-t-4 border-l-4 border-[#D4AF37] rounded-tl-xl" />
                    <div className="absolute top-6 right-6 w-16 h-16 border-t-4 border-r-4 border-[#D4AF37] rounded-tr-xl" />
                    <div className="absolute bottom-6 left-6 w-16 h-16 border-b-4 border-l-4 border-[#D4AF37] rounded-bl-xl" />
                    <div className="absolute bottom-6 right-6 w-16 h-16 border-b-4 border-r-4 border-[#D4AF37] rounded-br-xl" />

                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-10 relative z-10">
                        <div className="space-y-4">
                        <div className="flex items-center gap-8 justify-center">
                            <div className="relative inline-block">
                                <div className="absolute inset-0 bg-[#D4AF37]/20 blur-2xl rounded-full" />
                                <NextImage src="/images/logo.png" alt="Diploma Seal" width={90} height={90} className="relative z-10 drop-shadow-[0_0_15px_rgba(212,175,55,0.4)]" />
                            </div>
                            <div className="text-left">
                                <h1 className="text-3xl font-serif font-black uppercase tracking-[0.4em] text-[#D4AF37] leading-none mb-2">Rillcod Technologies</h1>
                                <div className="flex items-center gap-4">
                                    <div className="h-[1px] w-12 bg-[#D4AF37]" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[#D4AF37]/80">Instituted MMXXV</span>
                                </div>
                            </div>
                        </div>
                        </div>

                        <div className="space-y-6">
                            <p className="text-lg font-serif italic text-slate-400">This official scroll hereby honors and declares that</p>
                            <h2 className="text-6xl font-serif font-black text-white italic tracking-tight">{studentName}</h2>
                            <p className="text-lg font-serif italic text-slate-400">has achieved outstanding distinction and successfully completed</p>
                            <div className="py-6 px-12 border-y border-[#D4AF37]/30">
                                <h3 className="text-4xl font-serif font-bold text-[#D4AF37] tracking-wider uppercase">{courseTitle}</h3>
                                <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 mt-2">{programName} Excellence Track</p>
                            </div>
                        </div>

                        <div className="w-full flex justify-between items-end pt-12 max-w-4xl mx-auto">
                            <div className="text-center space-y-4">
                                <div className="relative">
                                    <NextImage src="/images/signature.png" alt="Director Signature" width={180} height={70} className="drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] brightness-0 invert" />
                                    <div className="absolute inset-0 bg-[#D4AF37]/10 mix-blend-color" />
                                </div>
                                <div>
                                    <div className="w-56 h-[1px] bg-[#D4AF37]/40 mb-2 mx-auto" />
                                    <p className="text-[11px] font-black uppercase tracking-widest text-[#D4AF37]">Director of Rillcod Technologies</p>
                                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">Seal of Authentication</p>
                                </div>
                            </div>

                            <div className="flex flex-col items-center space-y-4 pb-2">
                                <div className="p-2 bg-white rounded-lg shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                                    <QRCode value={`https://rillcod.com/verify/${verificationCode}`} size={90} fgColor="#0F172A" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 leading-none">Security Node</p>
                                    <p className="text-[12px] font-black text-[#D4AF37] font-mono leading-none">{verificationCode}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
