'use client';

import React, { useEffect, useState } from 'react';
import { CertificateCard } from '@/components/ui/CertificateCard';
import { TrophyIcon, SparklesIcon, MagnifyingGlassIcon } from '@/lib/icons';
import { Skeleton } from '@/components/ui/skeleton';

export default function CertificateVault() {
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        async function fetchCertificates() {
            try {
                const res = await fetch('/api/certificates');
                if (res.ok) {
                    const data = await res.json();
                    setCertificates(data);
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
        cert.courses.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cert.certificate_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-950 p-6 lg:p-10 space-y-10">
            {/* Header Section */}
            <div className="relative overflow-hidden bg-slate-900 border border-slate-800 p-8 lg:p-12">
                <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full -mr-48 -mt-48 blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-500/20 border border-teal-500/30">
                                <TrophyIcon className="w-6 h-6 text-teal-400" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-500/80">Academic Achievement</span>
                        </div>
                        <h1 className="text-4xl lg:text-6xl font-black text-white tracking-tighter uppercase italic leading-none">
                            Certificate <span className="text-teal-500">Vault</span>
                        </h1>
                        <p className="max-w-xl text-slate-400 text-sm font-medium leading-relaxed">
                            A secure, permanent archive for all your successfully earned certificates at Rillcod Academy. 
                            Download, share, or verify your institutional honors directly from this portal.
                        </p>
                    </div>

                    <div className="relative max-w-md w-full">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                            type="text"
                            placeholder="SEARCH VAULT..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 py-3 pl-12 pr-4 text-xs font-black uppercase tracking-widest text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="aspect-[3/4] bg-slate-900 border border-slate-800 animate-pulse" />
                    ))}
                </div>
            ) : filteredCerts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {filteredCerts.map(cert => (
                        <CertificateCard key={cert.id} cert={cert} />
                    ))}
                </div>
            ) : (
                <div className="h-96 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 text-center space-y-4">
                    <div className="p-6 rounded-full bg-slate-900">
                        <SparklesIcon className="w-12 h-12 text-slate-700" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-white font-black uppercase tracking-widest italic">No Certificates Found</h3>
                        <p className="text-slate-500 text-xs font-medium">Continue your learning journey to earn institutional honors.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
