'use client';

import React from 'react';
import { ShieldCheck, GraduationCap, Zap, Star, Trophy } from 'lucide-react';
import QRCode from 'react-qr-code';

export type TemplateType = 'prestige' | 'royal' | 'tech' | 'scholar' | 'elite' | 'spark';

export const TEMPLATES: { id: TemplateType; label: string }[] = [
    { id: 'prestige', label: 'Prestige Dark' },
    { id: 'royal',   label: 'Royal Gold' },
    { id: 'tech',    label: 'Cyber Tech' },
    { id: 'scholar', label: 'Academic Blue' },
    { id: 'elite',   label: 'Elite Platinum' },
    { id: 'spark',   label: 'Creative Spark' },
];

interface CertificateTemplatesProps {
    template: TemplateType;
    studentName: string;
    courseTitle: string;
    programName: string;
    studentClass: string;
    issuedDate: string;
    certCode: string;
    certNum: string;
}

export function CertificateTemplates({
    template, studentName, courseTitle, programName,
    studentClass, issuedDate, certCode, certNum,
}: CertificateTemplatesProps) {
    const verifyUrl = `https://rillcod.com/verify/${certCode}`;

    return (
        <div className="w-full h-full relative overflow-hidden bg-white select-none">
            {/* ════ PRESTIGE DARK ════════════════════════════════════════ */}
            {template === 'prestige' && (
                <div className="absolute inset-0 flex" style={{ background: 'linear-gradient(135deg, #050300 0%, #150a00 50%, #050300 100%)' }}>
                    <div style={{ width: '12px', background: 'linear-gradient(to bottom, #F97316, #FBBF24, #F97316)', flexShrink: 0 }} />
                    
                    {/* Left Sidebar */}
                    <div className="flex flex-col items-center justify-between py-[4%] px-[2.5%]" style={{ width: '25%', borderRight: '1px solid rgba(249,115,22,0.2)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-20 h-20 flex items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/30 shadow-lg shadow-orange-500/5">
                                <img src="/images/logo.png" alt="Rillcod" className="w-[85%] h-auto object-contain brightness-110" 
                                    onError={e => (e.currentTarget.style.display = 'none')} />
                            </div>
                            <p className="text-[10px] text-orange-400 font-black uppercase tracking-[0.3em] text-center leading-tight">
                                Rillcod <br/> Academy
                            </p>
                            <div className="h-px w-12 bg-orange-500/30" />
                        </div>

                        <div className="flex flex-col items-center gap-4">
                            <div className="w-24 h-24 p-1.5 bg-white rounded-lg shadow-2xl">
                                <QRCode value={verifyUrl} size={256} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-[7px] text-white/40 font-bold uppercase tracking-[0.1em] mb-1">Verify Credential</p>
                                <p className="text-[8px] text-orange-400 font-mono font-bold tracking-widest">{certCode}</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <ShieldCheck className="w-8 h-8 text-orange-400/70" strokeWidth={1} />
                            <p className="text-[8px] text-white/30 font-medium uppercase tracking-[0.2em]">Official Issuance</p>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex flex-col flex-1 py-[4%] px-[5%] justify-between">
                        <div className="relative">
                            <div className="absolute -top-4 -left-2 text-[60px] font-black text-white/[0.03] pointer-events-none select-none">OFFICIAL</div>
                            <p className="text-[10px] text-orange-400 font-black uppercase tracking-[0.5em] mb-4">Official Award of Recognition</p>
                            <h2 className="text-[44px] font-black text-white uppercase tracking-tighter leading-[0.9] mb-1">
                                Certificate <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">Of Excellence</span>
                            </h2>
                            <div className="w-24 h-1.5 bg-gradient-to-r from-orange-500 to-transparent" />
                        </div>

                        <div className="my-[4%]">
                            <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-[0.4em] mb-3">This Certifies That</p>
                            <h1 className="text-[48px] font-black text-white leading-none tracking-tight mb-2 drop-shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                                {studentName}
                            </h1>
                            <div className="h-px w-[80%] bg-gradient-to-r from-orange-500/50 via-orange-500/10 to-transparent" />
                            {studentClass && (
                                <p className="text-[11px] text-white/60 font-bold uppercase tracking-[0.2em] mt-3">Level: {studentClass}</p>
                            )}
                        </div>

                        <div className="mb-[4%]">
                            <p className="text-[11px] text-white/40 font-bold uppercase tracking-[0.2em] italic mb-2">has successfully completed all requirements for</p>
                            <h3 className="text-[22px] font-black text-white uppercase tracking-tight leading-tight mb-2">{courseTitle}</h3>
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/10 border border-orange-500/30 rounded-full">
                                <GraduationCap className="w-3.5 h-3.5 text-orange-400" />
                                <p className="text-[10px] text-amber-200 font-black uppercase tracking-[0.1em]">{programName}</p>
                            </div>
                        </div>

                        <div className="flex items-end justify-between border-t border-white/10 pt-8">
                            <div className="flex flex-col items-center">
                                <img src="/images/signature.png" alt="Director" className="h-10 w-auto invert brightness-200 contrast-150 mb-2" />
                                <div className="w-32 h-px bg-white/20 mb-2" />
                                <p className="text-[10px] text-white font-black uppercase tracking-widest leading-none">Osahon J.</p>
                                <p className="text-[7px] text-white/40 font-bold uppercase tracking-wider mt-1">Founding Director</p>
                            </div>

                            <div className="text-right">
                                <p className="text-[8px] text-orange-400 font-black uppercase tracking-[0.2em] mb-1">Date of Issue</p>
                                <p className="text-[12px] text-white font-black">{issuedDate}</p>
                                <p className="text-[8px] text-white/20 font-mono mt-2 tracking-tighter">{certNum}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ ROYAL GOLD (CREAM/GOLD) ═══════════════════════════════════ */}
            {template === 'royal' && (
                <div className="absolute inset-0 p-8 border-[12px] border-double border-[#C5A059]" style={{ backgroundColor: '#FFFEF7' }}>
                    <div className="absolute inset-2 border-[1px] border-[#C5A059]/30" />
                    
                    {/* Ornamental Corners */}
                    <div className="absolute top-0 left-0 w-24 h-24 border-t-4 border-l-4 border-[#C5A059] -m-1" />
                    <div className="absolute top-0 right-0 w-24 h-24 border-t-4 border-r-4 border-[#C5A059] -m-1" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 border-b-4 border-l-4 border-[#C5A059] -m-1" />
                    <div className="absolute bottom-0 right-0 w-24 h-24 border-b-4 border-r-4 border-[#C5A059] -m-1" />

                    <div className="h-full flex flex-col items-center justify-between text-center relative z-10 py-6">
                        <div className="space-y-4">
                            <div className="flex justify-center mb-2">
                                <img src="/images/logo.png" alt="Rillcod" className="h-16 w-auto grayscale contrast-125 brightness-50" />
                            </div>
                            <h4 className="text-[12px] text-orange-600 font-serif italic tracking-[0.2em] uppercase">Private Specialized Institution of Technology</h4>
                            <div className="flex items-center justify-center gap-6">
                                <div className="h-[2px] w-20 bg-gradient-to-r from-transparent to-orange-400" />
                                <h1 className="text-[42px] font-serif text-[#1C1C1C] uppercase tracking-[0.1em] font-light leading-none">Certificate of Achievement</h1>
                                <div className="h-[2px] w-20 bg-gradient-to-l from-transparent to-orange-400" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[14px] text-[#4A4A4A] font-serif italic mb-4">This scroll serves as a formal testament that</p>
                            <h2 className="text-[52px] font-serif text-orange-500 tracking-tight leading-none mb-4 italic font-bold" style={{ textShadow: '1px 1px 1px rgba(0,0,0,0.1)' }}>
                                {studentName}
                            </h2>
                            <p className="text-[14px] text-[#4A4A4A] font-serif italic max-w-2xl mx-auto border-t border-b border-orange-500/20 py-4">
                                has demonstrated exceptional command and scholarly mastery in the curriculum of
                                <br />
                                <span className="text-[20px] text-[#1C1C1C] font-bold not-italic font-sans uppercase tracking-[0.05em] block mt-2">{courseTitle}</span>
                            </p>
                        </div>

                        <div className="flex w-full items-end justify-between px-12">
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-white p-1 border border-orange-400 shadow-sm mb-3">
                                    <QRCode value={verifyUrl} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                                </div>
                                <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest">{certCode}</p>
                            </div>

                            <div className="space-y-4">
                                <div className="text-center w-52 space-y-2">
                                    <img src="/images/signature.png" alt="Sig" className="h-12 w-auto mx-auto brightness-0 opacity-80" />
                                    <div className="h-px w-full bg-orange-400" />
                                    <p className="text-[12px] font-serif text-[#1C1C1C] font-bold">Osahon J. — Executive Director</p>
                                    <p className="text-[11px] text-[#4A4A4A] font-serif opacity-70">Issued on the {issuedDate}</p>
                                </div>
                            </div>

                            <div className="relative">
                                <Trophy className="w-20 h-20 text-orange-400/20" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-14 h-14 rounded-full border-4 border-orange-400/40 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                                        <Star className="w-6 h-6 text-orange-500" fill="currentColor" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ CYBER TECH ═════════════════════════════════════════════ */}
            {template === 'tech' && (
                <div className="absolute inset-0 bg-[#070400] p-6 font-mono text-orange-400 overflow-hidden">
                    {/* Grid Background */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(249,115,22,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-tr from-transparent via-orange-500/5 to-transparent rotate-12 -translate-y-1/2" />
                    
                    {/* UI Borders */}
                    <div className="absolute inset-4 border border-orange-400/20" />
                    <div className="absolute top-4 left-4 p-2 bg-orange-500 text-black text-[10px] font-black uppercase tracking-tighter">Verified_Link: //rillcod.io</div>
                    
                    <div className="h-full border-r-[40px] border-orange-900/40 relative z-10 flex flex-col justify-between py-10 px-12">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <Zap className="w-8 h-8 text-orange-400 animate-pulse drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                                    <h2 className="text-[32px] font-black tracking-tighter text-white">TECH_MASTERY</h2>
                                </div>
                                <p className="text-[10px] opacity-60 uppercase tracking-[0.4em] mb-1">Authorization Node: RILLCOD-SYS-01</p>
                                <p className="text-[10px] opacity-60 uppercase tracking-[0.4em]">Protocol: {programName}</p>
                            </div>
                            <div className="w-24 h-24 p-1 bg-orange-400/20 border border-orange-400/40">
                                <QRCode value={verifyUrl} size={256} style={{ height: "auto", maxWidth: "100%", width: "100%", filter: 'invert(1) hue-rotate(180deg) saturate(2)' }} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] text-orange-400/60 uppercase tracking-widest">[SYSTEM_NOTIFICATION]: CREDENTIAL_UNLOCKED</p>
                                <h1 className="text-[54px] font-black text-white leading-none tracking-tighter uppercase">{studentName}</h1>
                                <div className="h-1.5 w-full bg-orange-400/10 mt-2 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-orange-400 w-2/3 h-full" />
                                </div>
                            </div>
                            <p className="text-[16px] text-orange-400 max-w-xl border-l-4 border-orange-400 pl-4 py-2 bg-orange-400/5">
                                Successfully interfaced and mastered all critical modules of the <strong>{courseTitle}</strong> curriculum. Validated via decentralized consensus.
                            </p>
                        </div>

                        <div className="flex items-end justify-between">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <img src="/images/signature.png" alt="Sig" className="h-10 w-auto invert brightness-200 contrast-150" />
                                    <div className="h-0.5 w-48 bg-orange-400/30" />
                                    <p className="text-white text-[12px] font-black uppercase tracking-tighter italic">Osahon J. | Tech_Director</p>
                                    <p className="text-[9px] text-orange-400 opacity-40 uppercase tracking-widest font-mono">AUTH_SIG://{certCode}</p>
                                </div>
                                <div className="p-2 border border-orange-400/30 inline-block bg-orange-900/20">
                                    <p className="text-[10px] font-black uppercase">Timestamp: {issuedDate}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[100px] font-black opacity-[0.03] leading-none select-none">CODE</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ ACADEMIC BLUE (SCHOLAR) ══════════════════════════════════ */}
            {template === 'scholar' && (
                <div className="absolute inset-0 bg-[#FFFBF7] p-10">
                    <div className="h-full border-[1px] border-orange-200/30 flex flex-col items-center justify-between py-12 px-16 bg-white shadow-inner relative overflow-hidden">
                        {/* Seal Watermark */}
                        <GraduationCap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 text-orange-950/5 rotate-[-15deg] pointer-events-none" />
                        
                        <div className="w-full flex justify-between items-center relative z-10 border-b-2 border-orange-100 pb-8">
                            <div className="space-y-1">
                                <h4 className="text-[20px] font-black text-orange-600 uppercase tracking-tighter leading-none">Rillcod Academy</h4>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Global Institute of Digital Excellence</p>
                            </div>
                            <img src="/images/logo.png" alt="Rillcod" className="h-10 w-auto opacity-80" />
                        </div>

                        <div className="text-center space-y-6 relative z-10">
                            <p className="text-[12px] text-slate-500 font-bold uppercase tracking-[0.3em]">This is to certify that the scholar</p>
                            <h1 className="text-[48px] font-black text-[#111827] tracking-tight leading-none px-12 border-b-[8px] border-orange-500 inline-block pb-1">
                                {studentName}
                            </h1>
                            <p className="text-[14px] text-slate-600 max-w-xl mx-auto leading-relaxed mt-6 font-medium">
                                has completed the academic requirements for the professional course <br/>
                                <span className="text-orange-600 font-black text-[22px] uppercase mt-2 block tracking-tight">{courseTitle}</span>
                                <span className="text-orange-400 font-bold text-[12px] uppercase tracking-widest mt-1 block tracking-widest opacity-80">{programName}</span>
                            </p>
                        </div>

                        <div className="w-full flex items-end justify-between relative z-10">
                            <div className="space-y-4">
                                <div className="text-left border-t border-slate-300 pt-3 w-56">
                                    <img src="/images/signature.png" alt="Sig" className="h-9 w-auto mb-2 opacity-80" />
                                    <p className="text-[12px] font-black text-[#111827] uppercase leading-none">Osahon J.</p>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 tracking-wider italic">Director of Rillcod Academy</p>
                                </div>
                                <div className="inline-flex items-center gap-3 px-3 py-1 bg-slate-100 rounded text-slate-600">
                                    <p className="text-[9px] font-bold uppercase tracking-widest">Status: OFFICIAL_VERIFIED</p>
                                </div>
                            </div>

                            <div className="flex flex-col items-center">
                                <div className="w-20 h-20 bg-white p-[2px] border-2 border-blue-900/20 mb-2">
                                    <QRCode value={verifyUrl} size={256} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                                </div>
                                <p className="text-[9px] font-mono text-slate-400">ID: {certCode}</p>
                            </div>

                            <div className="text-right space-y-1">
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Academic Year</p>
                                <p className="text-[14px] font-black text-[#111827] uppercase tracking-tight leading-none">{issuedDate}</p>
                                <p className="text-[8px] font-mono text-slate-300 mt-2">v{certNum}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ ELITE PLATINUM (MINIMAL LUXURY) ═════════════════════════════ */}
            {template === 'elite' && (
                <div className="absolute inset-0 bg-[#0F0F0F] flex items-center justify-center p-12">
                    <div className="absolute inset-1 border-[1px] border-white/5" />
                    <div className="absolute top-12 left-12 w-12 h-px bg-white/20" />
                    <div className="absolute left-12 top-12 w-px h-12 bg-white/20" />
                    
                    <div className="h-full w-full border-[1px] border-white/10 flex flex-col justify-between py-16 px-16 relative overflow-hidden bg-gradient-to-br from-black to-[#111]">
                        <div className="flex justify-between items-start border-b border-white/5 pb-10">
                            <div>
                                <h3 className="text-[10px] text-white/40 font-black uppercase tracking-[0.6em] mb-4">Elite Specialized Accreditation</h3>
                                <h1 className="text-[38px] font-black text-white uppercase tracking-tighter leading-none m-0">
                                    OFFICIAL_ <span className="text-white/30">ELITE</span>
                                </h1>
                            </div>
                            <div className="w-16 h-16 bg-white flex items-center justify-center rounded-sm">
                                <QRCode value={verifyUrl} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[11px] text-white/30 font-bold uppercase tracking-[0.4em]">Recipient of Recognition</p>
                            <h2 className="text-[72px] font-black text-white tracking-tighter leading-[0.8] mb-4">
                                {studentName}
                            </h2>
                            <p className="text-[18px] text-white italic border-l-[1px] border-orange-500/40 pl-6 py-1 max-w-xl opacity-80 leading-snug">
                                Awarded for achieving mastery in the advanced technology syllabus of {courseTitle} with the highest distinction of {programName}.
                            </p>
                        </div>

                        <div className="flex items-end justify-between pt-12 border-t border-white/5">
                            <div className="space-y-4">
                                <img src="/images/signature.png" alt="Sig" className="h-10 w-auto invert opacity-90 brightness-200" />
                                <div className="space-y-1">
                                    <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none">Osahon J.</p>
                                    <p className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Board Director, Rillcod Council</p>
                                </div>
                            </div>

                            <div className="text-right">
                                <p className="text-[100px] font-black opacity-[0.05] leading-none select-none absolute -bottom-4 right-12 z-0">ELITE</p>
                                <div className="relative z-10">
                                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em] mb-1">Issue_ID:{certCode}</p>
                                    <p className="text-[20px] text-white font-black leading-none">{issuedDate}</p>
                                    <p className="text-[8px] text-white/10 font-mono mt-2">{certNum}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ CREATIVE SPARK (COLORFUL) ═════════════════════════════════ */}
            {template === 'spark' && (
                <div className="absolute inset-0 bg-white" style={{ background: 'linear-gradient(135deg, #F97316 0%, #D97706 50%, #92400E 100%)' }}>
                    <div className="absolute inset-4 sm:inset-6 bg-white/95 backdrop-blur-3xl rounded-3xl overflow-hidden flex flex-col items-center justify-between p-8 sm:p-12 shadow-[0_30px_60px_rgba(0,0,0,0.3)] border border-white/50">
                        {/* Decorative dynamic shapes */}
                        <div className="absolute -top-24 -left-24 w-64 h-64 bg-orange-400 rounded-full blur-[80px] opacity-40 mix-blend-multiply" />
                        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-amber-400 rounded-full blur-[100px] opacity-40 mix-blend-multiply" />
                        <div className="absolute -bottom-24 -left-12 w-56 h-56 bg-orange-600 rounded-full blur-[60px] opacity-30 mix-blend-multiply" />

                        <div className="w-full flex justify-between items-start relative z-10">
                            <div className="p-3 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-700 rounded-2xl shadow-xl transform -rotate-3 hover:rotate-0 transition-transform">
                                <img src="/images/logo.png" alt="Rillcod" className="h-8 w-auto invert brightness-200 drop-shadow-md" />
                            </div>
                            <div className="text-right">
                                <h3 className="text-[20px] font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-800 italic leading-none mb-1">Creative Spark</h3>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest pl-4 border-l-2 border-orange-200 inline-block">Igniting Ambition</p>
                            </div>
                        </div>

                        <div className="text-center relative z-10 space-y-5">
                            <div className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 border border-yellow-400/50 rounded-full mb-2 shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                                <Star className="w-5 h-5 text-yellow-500 animate-pulse" fill="currentColor" />
                                <p className="text-[12px] text-yellow-700 font-black uppercase tracking-[0.2em]">Excellence Award</p>
                            </div>
                            <h1 className="text-[64px] font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-700 tracking-tighter leading-[0.9] drop-shadow-sm pb-2">
                                {studentName}
                            </h1>
                            <p className="text-[16px] text-slate-600 max-w-xl mx-auto leading-relaxed border-t border-b border-orange-100 py-4">
                                This momentous scroll verifies your extraordinary creativity and unstoppable drive in mastering the colorful realm of <br/>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-700 font-black text-[26px] tracking-tight block mt-3 mb-1 italic leading-none">{courseTitle}</span>
                                <span className="text-[12px] text-orange-600 font-bold uppercase tracking-widest">{programName}</span>
                            </p>
                        </div>

                        <div className="w-full flex items-end justify-between relative z-10 pt-4">
                            <div className="flex flex-col items-center">
                                <div className="w-24 h-24 bg-white p-2 rounded-2xl border-4 border-dashed border-orange-200 shadow-lg transform rotate-3 hover:rotate-0 transition-all">
                                    <QRCode value={verifyUrl} size={256} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                                </div>
                                <p className="text-[9px] font-black text-orange-600 uppercase mt-3 tracking-[0.3em] bg-orange-50 px-3 py-1 rounded-full">{certCode}</p>
                            </div>

                            <div className="text-center space-y-3">
                                <img src="/images/signature.png" alt="Sig" className="h-12 w-auto mx-auto opacity-80 mix-blend-multiply" />
                                <div className="h-1.5 w-32 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-700 rounded-full mx-auto" />
                                <div className="space-y-0.5">
                                    <p className="text-[12px] font-black text-slate-800 uppercase leading-none tracking-widest">Osahon J.</p>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase italic tracking-widest">Visionary Director</p>
                                </div>
                            </div>

                            <div className="text-right space-y-2">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-700 flex items-center justify-center shadow-xl transform -rotate-12 mb-4 ml-auto">
                                    <Trophy className="w-8 h-8 text-white drop-shadow-md" />
                                </div>
                                <p className="text-[16px] font-black text-slate-900 leading-none">{issuedDate}</p>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">{certNum}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
