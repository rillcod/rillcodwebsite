'use client';

import React from 'react';
import { CheckBadgeIcon } from '@/lib/icons';

export type TemplateType = 'prestige' | 'royal' | 'tech' | 'scholar' | 'elite' | 'spark';

export const TEMPLATES: { id: TemplateType; label: string }[] = [
    { id: 'prestige', label: 'Prestige' },
    { id: 'royal',   label: 'Royal'    },
    { id: 'tech',    label: 'Tech'     },
    { id: 'scholar', label: 'Scholar'  },
    { id: 'elite',   label: 'Elite'    },
    { id: 'spark',   label: 'Spark'    },
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
    return (
        <div className="w-full h-full relative overflow-hidden">
            {/* ════ PRESTIGE TEMPLATE ════════════════════════════════════════ */}
            {template === 'prestige' && (
                <div className="absolute inset-0 flex" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0f0c29 100%)' }}>
                    <div style={{ width: '4px', background: 'linear-gradient(to bottom, #FF914D, #ff6b1a, #FF914D)', flexShrink: 0 }} />

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
                            <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', wordBreak: 'break-all' }}>{certCode}</p>
                            <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(255,145,77,0.4)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>rillcod.com/verify</p>
                        </div>
                    </div>

                    <div className="flex flex-col justify-between flex-1 py-[6%] px-[5%]">
                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.9%, 8px)', color: 'rgba(255,145,77,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.35em' }}>Rillcod Technologies · Official Award</p>
                            <h2 style={{ fontSize: 'clamp(20px, 5.5%, 40px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, marginTop: '2%' }}>
                                Certificate <span style={{ color: '#FF914D' }}>Of Mastery</span>
                            </h2>
                            <div style={{ width: 'clamp(40px, 10%, 80px)', height: '2px', background: 'linear-gradient(to right, #FF914D, transparent)', marginTop: '1.5%' }} />
                        </div>
                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.85%, 7px)', color: 'rgba(255,255,255,0.3)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em' }}>This Certifies That</p>
                            <h1 style={{ fontSize: 'clamp(16px, 4.2%, 32px)', fontWeight: 900, color: '#FF914D', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: '1%', textShadow: '0 0 30px rgba(255,145,77,0.3)' }}>{studentName}</h1>
                            {studentClass && <p style={{ fontSize: 'clamp(4px, 0.8%, 7px)', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '0.5%' }}>{studentClass}</p>}
                        </div>
                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.25)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontStyle: 'italic' }}>has successfully completed</p>
                            <h3 style={{ fontSize: 'clamp(11px, 2.6%, 20px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '0.8%', lineHeight: 1.2 }}>{courseTitle}</h3>
                            <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', color: '#FF914D', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.5%' }}>{programName}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                            {[{ name: 'Mr Osahon', role: 'Director, Rillcod Technologies' }, { name: 'Head of Academics', role: 'Curriculum & Standards Board' }].map(sig => (
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
                    <div className="flex flex-col items-center justify-between w-full p-[7%_8%] text-center relative z-10">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5%' }}>
                            <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                style={{ height: 'clamp(24px, 5.5%, 40px)', width: 'auto', filter: 'grayscale(1) brightness(0.2)' }}
                                onError={e => (e.currentTarget.style.display = 'none')} />
                            <p style={{ fontSize: 'clamp(5px, 0.85%, 8px)', color: '#475569', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em' }}>Rillcod Technologies · Est. Excellence</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5%', width: '100%' }}>
                                <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
                                <div style={{ width: 6, height: 6, background: '#1e293b', transform: 'rotate(45deg)', flexShrink: 0 }} />
                                <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
                            </div>
                        </div>
                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.9%, 8px)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.35em', fontStyle: 'italic' }}>Be it known to all that</p>
                            <h2 style={{ fontSize: 'clamp(18px, 5%, 38px)', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, marginTop: '1%' }}>Certificate of Achievement</h2>
                        </div>
                        <div>
                            <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', fontStyle: 'italic' }}>is hereby awarded to</p>
                            <h1 style={{ fontSize: 'clamp(18px, 4.5%, 34px)', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: '0.8%', borderBottom: '2.5px solid #FF914D', paddingBottom: '1%' }}>{studentName}</h1>
                            <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '1%', fontStyle: 'italic' }}>
                                for successfully completing · <strong>{courseTitle}</strong> · {programName}
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }}>
                            {[{ name: 'Mr Osahon', role: 'Director' }, { name: 'Head of Academics', role: 'Curriculum Board' }].map(sig => (
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
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 6.5px)', color: 'rgba(255,145,77,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}>Auth.<br />Verified</p>
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
                                <p style={{ fontSize: 'clamp(5px, 0.9%, 8px)', color: 'rgba(255,145,77,0.4)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', fontFamily: 'monospace' }}>// Rillcod · Verified Digital Credential</p>
                                <h2 style={{ fontSize: 'clamp(22px, 5.8%, 42px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 0.95, marginTop: '1.5%' }}>
                                    Certificate<br /><span style={{ color: '#FF914D' }}>Of Mastery_</span>
                                </h2>
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', fontFamily: 'monospace' }}>&gt; RECIPIENT:</p>
                                <h1 style={{ fontSize: 'clamp(14px, 4%, 30px)', fontWeight: 900, color: '#FF914D', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1, marginTop: '0.8%', textShadow: '0 0 40px rgba(255,145,77,0.25)' }}>{studentName}</h1>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 6.5px)', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginTop: '0.5%' }}>&gt; MODULE: {courseTitle} · {programName}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                {[{ name: 'Mr Osahon', role: 'Director' }, { name: 'Head of Academics', role: 'Curriculum Board' }].map(sig => (
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
                                    <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(255,145,77,0.4)', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>DATE_ISSUED</p>
                                    <p style={{ fontSize: 'clamp(6px, 1%, 9px)', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontWeight: 700 }}>{issuedDate}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 5.5px)', color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', marginTop: 2 }}>{certNum}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ SCHOLAR TEMPLATE ══════════════════════════════════════════ */}
            {template === 'scholar' && (
                <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #f0f4ff 0%, #e8eeff 60%, #f0f4ff 100%)' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(to right, #1e3a5f, #c9a227, #1e3a5f)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(to right, #1e3a5f, #c9a227, #1e3a5f)' }} />
                    {['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'].map((pos, i) => (
                        <div key={i} className={`absolute ${pos}`} style={{ width: 20, height: 20, border: '2px solid #c9a227', borderRadius: 0 }} />
                    ))}
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100%' }}>
                        <div style={{ width: '22%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8% 3%', borderRight: '2px solid rgba(30,58,95,0.12)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 'clamp(36px, 9%, 58px)', height: 'clamp(36px, 9%, 58px)', borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(30,58,95,0.25)' }}>
                                    <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                        style={{ width: '65%', height: '65%', objectFit: 'contain', filter: 'brightness(10)' }}
                                        onError={e => (e.currentTarget.style.display = 'none')} />
                                </div>
                                <p style={{ fontSize: 'clamp(5px, 0.9%, 7.5px)', color: '#1e3a5f', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center', lineHeight: 1.5 }}>Rillcod<br />Technologies</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 'clamp(28px, 7%, 44px)', height: 'clamp(28px, 7%, 44px)', borderRadius: '50%', border: '2px solid #c9a227', background: 'rgba(201,162,39,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: '#c9a227', display: 'flex', padding: '18%' }}><CheckBadgeIcon className="w-full h-full" /></span>
                                </div>
                                <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: '#c9a227', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>Certified</p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: 'clamp(28px, 6%, 42px)', height: 'clamp(28px, 6%, 42px)', border: '1.5px solid rgba(30,58,95,0.3)', background: 'rgba(30,58,95,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                                    <span style={{ fontSize: 'clamp(6px, 1.2%, 10px)', fontWeight: 900, color: '#1e3a5f' }}>QR</span>
                                </div>
                                <p style={{ fontSize: 'clamp(3px, 0.6%, 5.5px)', color: 'rgba(30,58,95,0.4)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{certCode}</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8% 6%' }}>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.85%, 8px)', color: '#c9a227', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em' }}>Academic Excellence Award</p>
                                <h2 style={{ fontSize: 'clamp(20px, 5.2%, 38px)', fontWeight: 900, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, marginTop: '1.5%' }}>
                                    Certificate <span style={{ color: '#c9a227' }}>of Completion</span>
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '1.5%' }}>
                                    <div style={{ flex: 1, height: '2px', background: 'linear-gradient(to right, #1e3a5f, rgba(30,58,95,0.1))' }} />
                                    <div style={{ width: 6, height: 6, background: '#c9a227', transform: 'rotate(45deg)' }} />
                                </div>
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(30,58,95,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', fontStyle: 'italic' }}>This is to certify that</p>
                                <h1 style={{ fontSize: 'clamp(16px, 4.2%, 32px)', fontWeight: 900, color: '#1e3a5f', letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: '1%' }}>{studentName}</h1>
                                {studentClass && <p style={{ fontSize: 'clamp(4px, 0.8%, 7px)', color: '#c9a227', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '0.5%' }}>{studentClass}</p>}
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(30,58,95,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontStyle: 'italic' }}>has successfully completed</p>
                                <h3 style={{ fontSize: 'clamp(11px, 2.6%, 20px)', fontWeight: 900, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '0.8%', lineHeight: 1.2 }}>{courseTitle}</h3>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', color: '#c9a227', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.5%' }}>{programName}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                {[{ name: 'Mr Osahon', role: 'Director, Rillcod Technologies' }, { name: 'Head of Academics', role: 'Curriculum & Standards Board' }].map(sig => (
                                    <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                        <img src="/images/signature.png" alt={sig.name} crossOrigin="anonymous"
                                            style={{ height: 'clamp(14px, 3.5%, 28px)', width: 'auto', filter: 'contrast(200%) sepia(1) hue-rotate(180deg) saturate(3)' }}
                                            onError={e => (e.currentTarget.style.display = 'none')} />
                                        <div style={{ width: 'clamp(60px, 14%, 100px)', height: '1.5px', background: '#1e3a5f' }} />
                                        <p style={{ fontSize: 'clamp(5px, 0.75%, 7px)', color: '#1e3a5f', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{sig.name}</p>
                                        <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: 'rgba(30,58,95,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sig.role}</p>
                                    </div>
                                ))}
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(30,58,95,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Date Issued</p>
                                    <p style={{ fontSize: 'clamp(6px, 1%, 9px)', color: '#1e3a5f', fontWeight: 900 }}>{issuedDate}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: 'rgba(30,58,95,0.3)', fontFamily: 'monospace', marginTop: 2 }}>{certNum}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ ELITE TEMPLATE ════════════════════════════════════════════ */}
            {template === 'elite' && (
                <div className="absolute inset-0" style={{ background: '#0a0a0a' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '38%', height: '100%', background: 'linear-gradient(135deg, #1a1400 0%, #0a0a0a 100%)', borderRight: '1px solid rgba(201,162,39,0.2)' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(to bottom, #c9a227, #7a5f12, #c9a227)' }} />
                    <div style={{ position: 'absolute', top: '10%', left: '38%', right: 0, height: '1px', background: 'rgba(201,162,39,0.2)' }} />
                    <div style={{ position: 'absolute', bottom: '10%', left: '38%', right: 0, height: '1px', background: 'rgba(201,162,39,0.2)' }} />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '70%', height: '80%', background: 'radial-gradient(ellipse, rgba(201,162,39,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100%' }}>
                        <div style={{ width: '38%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8% 4%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 'clamp(36px, 9%, 58px)', height: 'clamp(36px, 9%, 58px)', borderRadius: '50%', border: '2px solid rgba(201,162,39,0.5)', background: 'rgba(201,162,39,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                        style={{ width: '60%', height: '60%', objectFit: 'contain', filter: 'brightness(200%) sepia(1) hue-rotate(5deg) saturate(2)' }}
                                        onError={e => (e.currentTarget.style.display = 'none')} />
                                </div>
                                <p style={{ fontSize: 'clamp(5px, 0.85%, 7px)', color: '#c9a227', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', textAlign: 'center', lineHeight: 1.6 }}>Rillcod<br />Technologies</p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 'clamp(16px, 4.5%, 34px)', fontWeight: 900, color: '#c9a227', letterSpacing: '0.1em', lineHeight: 1 }}>★</p>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 6.5px)', color: 'rgba(201,162,39,0.6)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 4 }}>Excellence</p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: 'clamp(28px, 6%, 42px)', height: 'clamp(28px, 6%, 42px)', border: '1px solid rgba(201,162,39,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', background: 'rgba(201,162,39,0.04)' }}>
                                    <span style={{ fontSize: 'clamp(7px, 1.3%, 10px)', fontWeight: 900, color: '#c9a227' }}>QR</span>
                                </div>
                                <p style={{ fontSize: 'clamp(3px, 0.6%, 5.5px)', color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{certCode}</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10% 6% 8%' }}>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.85%, 8px)', color: 'rgba(201,162,39,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.45em' }}>Rillcod Technologies</p>
                                <h2 style={{ fontSize: 'clamp(18px, 5%, 38px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, marginTop: '1.5%' }}>
                                    Certificate<br /><span style={{ color: '#c9a227' }}>of Excellence</span>
                                </h2>
                                <div style={{ width: 'clamp(40px, 12%, 80px)', height: '2px', background: '#c9a227', marginTop: '2%', opacity: 0.6 }} />
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.25)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3em', fontStyle: 'italic' }}>Proudly awarded to</p>
                                <h1 style={{ fontSize: 'clamp(15px, 4%, 30px)', fontWeight: 900, color: '#c9a227', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: '1%' }}>{studentName}</h1>
                                {studentClass && <p style={{ fontSize: 'clamp(4px, 0.8%, 7px)', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '0.5%' }}>{studentClass}</p>}
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontStyle: 'italic' }}>in recognition of completing</p>
                                <h3 style={{ fontSize: 'clamp(11px, 2.5%, 19px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '0.8%', lineHeight: 1.2 }}>{courseTitle}</h3>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', color: 'rgba(201,162,39,0.6)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.5%' }}>{programName}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                {[{ name: 'Mr Osahon', role: 'Director' }, { name: 'Head of Academics', role: 'Curriculum Board' }].map(sig => (
                                    <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                        <img src="/images/signature.png" alt={sig.name} crossOrigin="anonymous"
                                            style={{ height: 'clamp(14px, 3.5%, 26px)', width: 'auto', filter: 'brightness(500%) invert(1) sepia(1) hue-rotate(5deg) saturate(2)' }}
                                            onError={e => (e.currentTarget.style.display = 'none')} />
                                        <div style={{ width: 'clamp(48px, 12%, 90px)', height: '1px', background: 'rgba(201,162,39,0.4)' }} />
                                        <p style={{ fontSize: 'clamp(5px, 0.75%, 6.5px)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sig.name}</p>
                                        <p style={{ fontSize: 'clamp(4px, 0.6%, 5.5px)', color: 'rgba(201,162,39,0.4)', fontWeight: 700, textTransform: 'uppercase' }}>{sig.role}</p>
                                    </div>
                                ))}
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(201,162,39,0.4)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Date Issued</p>
                                    <p style={{ fontSize: 'clamp(6px, 1%, 9px)', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{issuedDate}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: 'rgba(255,255,255,0.12)', fontFamily: 'monospace', marginTop: 2 }}>{certNum}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ SPARK TEMPLATE ════════════════════════════════════════════ */}
            {template === 'spark' && (
                <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0d0221 0%, #11083a 40%, #0a1628 100%)' }}>
                    <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '50%', height: '70%', background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '40%', height: '60%', background: 'radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: '30%', left: '30%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(to right, #8b5cf6, #06b6d4, #ec4899, #8b5cf6)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(to right, #06b6d4, #8b5cf6, #ec4899, #06b6d4)' }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100%' }}>
                        <div style={{ width: '24%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8% 3%', borderRight: '1px solid rgba(139,92,246,0.15)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 'clamp(32px, 8%, 52px)', height: 'clamp(32px, 8%, 52px)', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.3))', border: '1.5px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src="/images/logo.png" alt="Rillcod" crossOrigin="anonymous"
                                        style={{ width: '60%', height: '60%', objectFit: 'contain', filter: 'brightness(10)' }}
                                        onError={e => (e.currentTarget.style.display = 'none')} />
                                </div>
                                <p style={{ fontSize: 'clamp(5px, 0.85%, 7px)', color: '#a78bfa', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center', lineHeight: 1.5 }}>Rillcod<br />Technologies</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 'clamp(26px, 6%, 40px)', height: 'clamp(26px, 6%, 40px)', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))', border: '1px solid rgba(6,182,212,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: '#06b6d4', display: 'flex', padding: '18%' }}><CheckBadgeIcon className="w-full h-full" /></span>
                                </div>
                                <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(6,182,212,0.7)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}>Verified</p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: 'clamp(26px, 5.5%, 40px)', height: 'clamp(26px, 5.5%, 40px)', border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                                    <span style={{ fontSize: 'clamp(6px, 1.2%, 10px)', color: '#a78bfa', fontWeight: 900 }}>QR</span>
                                </div>
                                <p style={{ fontSize: 'clamp(3px, 0.6%, 5.5px)', color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{certCode}</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '7% 5%' }}>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.85%, 8px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4em', background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                                    Rillcod · Digital Achievement
                                </p>
                                <h2 style={{ fontSize: 'clamp(20px, 5.3%, 40px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 0.95, marginTop: '1.5%' }}>
                                    Certificate<br />
                                    <span style={{ background: 'linear-gradient(90deg, #8b5cf6, #06b6d4, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                                        of Mastery
                                    </span>
                                </h2>
                                <div style={{ display: 'flex', gap: 4, marginTop: '1.5%' }}>
                                    {['#8b5cf6','#06b6d4','#ec4899'].map((c, i) => (
                                        <div key={i} style={{ width: 'clamp(16px, 4%, 28px)', height: '3px', background: c, borderRadius: 2 }} />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.25)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em' }}>This certifies that</p>
                                <h1 style={{ fontSize: 'clamp(14px, 4%, 30px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1, marginTop: '0.8%' }}>{studentName}</h1>
                                {studentClass && <p style={{ fontSize: 'clamp(4px, 0.8%, 7px)', color: 'rgba(139,92,246,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '0.5%' }}>{studentClass}</p>}
                            </div>
                            <div>
                                <p style={{ fontSize: 'clamp(5px, 0.8%, 7px)', color: 'rgba(255,255,255,0.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>has successfully completed</p>
                                <h3 style={{ fontSize: 'clamp(11px, 2.6%, 20px)', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '0.8%', lineHeight: 1.2 }}>{courseTitle}</h3>
                                <p style={{ fontSize: 'clamp(4px, 0.75%, 7px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.5%', background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{programName}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                {[{ name: 'Mr Osahon', role: 'Director' }, { name: 'Head of Academics', role: 'Curriculum Board' }].map(sig => (
                                    <div key={sig.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                        <img src="/images/signature.png" alt={sig.name} crossOrigin="anonymous"
                                            style={{ height: 'clamp(14px, 3.5%, 26px)', width: 'auto', filter: 'brightness(500%) invert(1)' }}
                                            onError={e => (e.currentTarget.style.display = 'none')} />
                                        <div style={{ width: 'clamp(48px, 12%, 90px)', height: '1px', background: 'linear-gradient(to right, #8b5cf6, #06b6d4)' }} />
                                        <p style={{ fontSize: 'clamp(5px, 0.75%, 6.5px)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sig.name}</p>
                                        <p style={{ fontSize: 'clamp(4px, 0.6%, 5.5px)', color: 'rgba(139,92,246,0.5)', fontWeight: 700, textTransform: 'uppercase' }}>{sig.role}</p>
                                    </div>
                                ))}
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: 'clamp(4px, 0.7%, 6px)', color: 'rgba(6,182,212,0.5)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Date Issued</p>
                                    <p style={{ fontSize: 'clamp(6px, 1%, 9px)', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{issuedDate}</p>
                                    <p style={{ fontSize: 'clamp(4px, 0.65%, 6px)', color: 'rgba(255,255,255,0.12)', fontFamily: 'monospace', marginTop: 2 }}>{certNum}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
