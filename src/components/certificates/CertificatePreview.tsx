'use client';

import React from 'react';
import { CertificateTemplates, type TemplateType } from './shared/CertificateTemplates';

export interface CertificatePreviewProps {
    studentName?: string | null;
    schoolName?: string | null; // Keep for compatibility if used elsewhere, though not in shared
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
    courseTitle = 'Course Title',
    programName = 'Program Name',
    issuedDate = new Date().toISOString(),
    certificateNumber = 'RC-XXXX-XXXX',
    verificationCode = 'XXXXXX',
    templateId = 'prestige',
    isLandscape = true
}: CertificatePreviewProps) {
    // Map old template IDs if they come from DB, else default to prestige
    const mappedTemplate = (id: string | null): TemplateType => {
        if (!id) return 'prestige';
        const validTemplates: TemplateType[] = ['prestige', 'royal', 'tech', 'scholar', 'elite', 'spark'];
        if (validTemplates.includes(id as TemplateType)) return id as TemplateType;
        
        // Basic mapping for transition
        if (id === 'modern-sharp') return 'prestige';
        if (id === 'royal-diploma') return 'royal';
        return 'prestige';
    };

    const containerStyle = isLandscape
        ? { width: '297mm', height: '210mm' }
        : { width: '210mm', height: '297mm' };

    return (
        <div
            id="certificate-preview-container"
            className="relative overflow-hidden shadow-2xl transition-all duration-500 hover:shadow-[0_0_60px_rgba(0,0,0,0.3)] bg-white"
            style={{ ...containerStyle }}
        >
            {/* Structural corner marks — only for digital preview */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-black/5 z-20 pointer-events-none" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-black/5 z-20 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-black/5 z-20 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-black/5 z-20 pointer-events-none" />

            <CertificateTemplates
                template={mappedTemplate(templateId)}
                studentName={studentName || 'Recipient Name'}
                courseTitle={courseTitle || 'Course Title'}
                programName={programName || 'Program name'}
                studentClass="" 
                issuedDate={issuedDate ? new Date(issuedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                certCode={verificationCode || 'XXXXXX'}
                certNum={certificateNumber || 'RC-XXXX-XXXX'}
            />

            {/* Subtle digital watermark — visible only on-screen, doesn't interfere with high-res capture usually */}
            <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center opacity-[0.02] mix-blend-multiply select-none">
                <p className="text-[120px] font-black uppercase rotate-[-25deg] tracking-widest text-black">
                    RILLCOD ACADEMY
                </p>
            </div>
        </div>
    );
}
