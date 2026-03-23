'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { CertificateCard } from '@/components/ui/CertificateCard';
import { TrophyIcon, MagnifyingGlassIcon, ShieldCheckIcon } from '@/lib/icons';

export default function CertificateVault() {
    const { profile, loading: authLoading } = useAuth();
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (authLoading || !profile) return;
        async function fetchCertificates() {
            try {
                const res = await fetch('/api/certificates');
                if (res.ok) {
                    const json = await res.json();
                    setCertificates(json.data || []);
                }
            } catch (error) {
                console.error('Error fetching certificates:', error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchCertificates();
    }, [profile?.id, authLoading]);

    const filteredCerts = certificates.filter(cert =>
        (cert.courses?.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (cert.certificate_number?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    if (authLoading) return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="bg-[#0A0A0B] p-4 sm:p-6 lg:p-8 space-y-8">
            {/* Header */}
            <div className="bg-[#111113] border border-white/[0.05] p-6 sm:p-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 border border-primary/20">
                                <TrophyIcon className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tighter">
                                    My Certificates
                                </h1>
                                <p className="text-xs text-slate-500 mt-0.5">Certificates you have earned</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative max-w-sm w-full group">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by course or certificate ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-white/[0.1] py-3 pl-12 pr-4 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-primary transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="space-y-8">
                    {[1, 2].map(i => (
                        <div key={i} style={{ aspectRatio: '297/210' }} className="w-full bg-white/[0.02] border border-white/[0.05] relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                        </div>
                    ))}
                </div>
            ) : filteredCerts.length > 0 ? (
                <div className="space-y-12">
                    {filteredCerts.map(cert => (
                        <div key={cert.id} className="group relative max-w-4xl mx-auto">
                            <CertificateCard cert={cert} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="h-[360px] flex flex-col items-center justify-center border border-dashed border-white/[0.05] bg-white/[0.01] text-center space-y-4">
                    <div className="p-6 bg-white/[0.02] border border-white/[0.05]">
                        <ShieldCheckIcon className="w-12 h-12 text-slate-800" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-white font-bold text-sm">No certificates yet</h3>
                        <p className="text-slate-600 text-xs">Your certificates will appear here once issued.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
