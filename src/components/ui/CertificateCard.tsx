'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Share2, Award, CheckCircle2, QrCode } from 'lucide-react';
import { format } from 'date-fns';

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
    return (
        <Card className="group relative w-full overflow-hidden border-none shadow-2xl hover:shadow-teal-500/10 transition-all duration-500">
            {/* Decorative Background Patterns */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full -ml-32 -mb-32 blur-3xl animate-pulse delay-700" />

            {/* Golden Border Embellishment */}
            <div className="absolute inset-4 border border-teal-500/20 rounded-xl pointer-events-none" />
            <div className="absolute inset-6 border border-teal-500/10 rounded-lg pointer-events-none" />

            <CardContent className="relative p-12 text-center space-y-8">
                <div className="flex justify-center">
                    <div className="p-4 rounded-full bg-teal-500/10 ring-4 ring-teal-500/5">
                        <Award className="w-16 h-16 text-teal-400" strokeWidth={1.5} />
                    </div>
                </div>

                <div className="space-y-2">
                    <Badge variant="outline" className="text-teal-400 border-teal-500/30 uppercase tracking-[0.2em] text-[10px] font-bold px-4 py-1">
                        Certificate of Completion
                    </Badge>
                    <h2 className="text-3xl font-serif font-bold text-white tracking-tight">
                        {cert.courses.title}
                    </h2>
                    <div className="flex items-center justify-center gap-2 text-slate-400 mt-4">
                        <CheckCircle2 className="w-4 h-4 text-teal-500" />
                        <span className="text-sm font-medium">Successfully completed with honors</span>
                    </div>
                </div>

                <div className="py-6 border-y border-white/5 space-y-1">
                    <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Awarded To</p>
                    <p className="text-2xl font-serif text-teal-500 italic">Learner Name</p>
                </div>

                <div className="grid grid-cols-2 gap-8 text-left max-w-sm mx-auto">
                    <div>
                        <p className="text-slate-500 text-[10px] uppercase font-black">Issued On</p>
                        <p className="text-white text-sm font-medium">{format(new Date(cert.issued_date), 'MMMM dd, yyyy')}</p>
                    </div>
                    <div>
                        <p className="text-slate-500 text-[10px] uppercase font-black">Verify ID</p>
                        <p className="text-white text-sm font-medium font-mono">{cert.verification_code}</p>
                    </div>
                </div>

                <div className="pt-8 flex items-center justify-center gap-4">
                    <Button className="bg-teal-600 hover:bg-teal-500 text-white rounded-full px-6 gap-2 transition-transform active:scale-95 shadow-lg shadow-teal-500/20">
                        <Download className="w-4 h-4" /> Download PDF
                    </Button>
                    <Button variant="outline" className="rounded-full px-4 border-slate-700 text-slate-300 hover:bg-slate-800 gap-2">
                        <Share2 className="w-4 h-4" /> Share
                    </Button>
                    <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white rounded-full" title="Verification Page">
                        <QrCode className="w-5 h-5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
