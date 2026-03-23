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
            className="relative bg-white overflow-hidden shadow-2xl"
            style={{ ...containerStyle }}
        >
            <CertificateTemplates
                template={mappedTemplate(templateId)}
                studentName={studentName || 'Recipient Name'}
                courseTitle={courseTitle || 'Course Title'}
                programName={programName || 'Program name'}
                studentClass="" // Preview doesn't always have class context in the same way
                issuedDate={issuedDate ? new Date(issuedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                certCode={verificationCode || 'XXXXXX'}
                certNum={certificateNumber || 'RC-XXXX-XXXX'}
            />
        </div>
    );
}
