'use client';

import React, { useEffect, useState } from 'react';
import { CertificateCard } from '@/components/ui/CertificateCard';
import { TrophyIcon, SparklesIcon, MagnifyingGlassIcon, ArrowPathIcon, ShieldCheckIcon } from '@/lib/icons';

export default function CertificateVault() {
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        async function fetchCertificates() {
            try {
                const res = await fetch('/api/certificates');
                if (res.ok) {
                    const json = await res.json();
                    // Handle the { success: true, data: [...] } format correctly
                    setCertificates(json.data || []);
                }
            } catch (error) {
                console.error('Error fetching certificates:', error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchCertificates();
    }, []);

    const filteredCerts = certificates.filter(cert => 
        (cert.courses?.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (cert.certificate_number?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#0A0A0B] p-6 lg:p-10 space-y-12 animate-fade-in custom-scrollbar">
            {/* Header Section */}
            <div className="relative overflow-hidden bg-[#111113] border border-white/[0.05] p-10 lg:p-16 shadow-2xl">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] -mr-64 -mt-64 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col xl:flex-row xl:items-end justify-between gap-10">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 border border-primary/20">
                                <TrophyIcon className="w-7 h-7 text-primary" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-primary/80">Secured Digital Vault</span>
                        </div>
                        <div>
                            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tighter uppercase italic leading-none mb-4">
                                Institutional <span className="text-primary italic">Honors</span>
                            </h1>
                            <p className="max-w-2xl text-slate-500 text-sm font-medium leading-relaxed uppercase tracking-tight italic opacity-80">
                                Your permanent, cryptographically verified record of academic excellence at Rillcod Technologies. 
                                Manage, share, and verify your credentials globally within our secure ecosystem.
                            </p>
                        </div>
                    </div>

                    <div className="relative max-w-lg w-full group">
                        <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-primary transition-colors" />
                        <input 
                            type="text"
                            placeholder="SEARCH BY PROGRAM OR ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-white/[0.1] py-5 pl-14 pr-8 text-[11px] font-black uppercase tracking-[0.2em] text-white placeholder:text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all shadow-inner"
                        />
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="aspect-[4/3] bg-white/[0.02] border border-white/[0.05] relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                        </div>
                    ))}
                </div>
            ) : filteredCerts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                    {filteredCerts.map(cert => (
                        <div key={cert.id} className="group relative">
                            {/* Accent border that appears on hover */}
                            <div className="absolute -inset-[1px] bg-primary/0 group-hover:bg-primary transition-colors duration-500 z-0" />
                            <div className="relative z-10">
                                <CertificateCard cert={cert} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="h-[400px] flex flex-col items-center justify-center border border-dashed border-white/[0.05] bg-white/[0.01] text-center space-y-6">
                    <div className="p-8 bg-white/[0.02] border border-white/[0.05]">
                        <ShieldCheckIcon className="w-16 h-16 text-slate-800" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-white font-black uppercase tracking-[0.3em] italic">No Records Detected</h3>
                        <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Your institutional credentials will appear here once authorized.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
