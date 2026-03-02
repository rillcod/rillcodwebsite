import React from 'react';
import { certificateService } from '@/services/certificate.service';
import { CheckCircle2, XCircle, Award, Calendar, User, BookOpen, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata = {
    title: 'Verify Certificate | Rillcod Academy',
    description: 'Verify the authenticity of Rillcod Academy certificates.',
};

export default async function VerifyPage({ params }: { params: { code: string } }) {
    let cert = null;
    let error = null;

    try {
        cert = await certificateService.verifyCertificate(params.code);
    } catch (e) {
        error = 'Invalid certificate verification code.';
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                <div className="bg-teal-600 p-8 text-center text-white relative">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent)]" />
                    </div>
                    <Award className="w-16 h-16 mx-auto mb-4 opacity-90" />
                    <h1 className="text-3xl font-black tracking-tight">RILLCOD ACADEMY</h1>
                    <p className="text-teal-100 font-bold uppercase tracking-widest text-sm mt-1">Official Verification Portal</p>
                </div>

                <div className="p-8 md:p-12">
                    {cert ? (
                        <div className="space-y-8">
                            <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-500/10 rounded-2xl border border-green-100 dark:border-green-500/20">
                                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                                <div>
                                    <h2 className="text-lg font-bold text-green-900 dark:text-green-300">Verified Authentic</h2>
                                    <p className="text-sm text-green-700 dark:text-green-400/80">This certificate is valid and issued by Rillcod Academy.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <User className="w-3 h-3" /> Recipient
                                    </p>
                                    <p className="text-xl font-bold text-slate-900 dark:text-white">{(cert.portal_users as any)?.full_name}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <BookOpen className="w-3 h-3" /> Course
                                    </p>
                                    <p className="text-xl font-bold text-slate-900 dark:text-white">{(cert.courses as any)?.title}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar className="w-3 h-3" /> Issue Date
                                    </p>
                                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{cert.issued_date}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Certificate ID</p>
                                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300 font-mono">{cert.certificate_number}</p>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4">
                                <Button className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-black text-white gap-2 font-bold" asChild>
                                    <Link href={cert.pdf_url || '#'}>
                                        <Download className="w-4 h-4" /> Download Original PDF
                                    </Link>
                                </Button>
                                <Button variant="outline" className="flex-1 h-12 rounded-xl border-2 gap-2 font-bold" asChild>
                                    <Link href="/">Visit Homepage</Link>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 space-y-6">
                            <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                                <XCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Verification Failed</h2>
                                <p className="text-slate-500 mt-2 max-w-xs mx-auto">We couldn't find a record matching this verification code. Please check the URL and try again.</p>
                            </div>
                            <Button className="h-12 px-8 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold" asChild>
                                <Link href="/">Back to Home</Link>
                            </Button>
                        </div>
                    )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-4 text-center border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        &copy; {new Date().getFullYear()} Rillcod Academy. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
