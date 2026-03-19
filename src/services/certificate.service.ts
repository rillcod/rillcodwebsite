import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { filesService } from './files.service';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import fs from 'fs';
import path from 'path';

export class CertificateService {
    async issueCertificate(studentId: string, courseId: string, issuerId?: string, schoolId?: string) {
        const supabase = await createClient();

        // 1. Verify eligibility (Simplified: check course progress/completion)
        // ... progress check ...

        // 2. Generate unique numbers
        const certNumber = `RC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const verifyCode = Math.random().toString(36).substring(2, 12).toUpperCase();

        // 3. Create record
        const { data: cert, error } = await supabase
            .from('certificates')
            .insert([{
                portal_user_id: studentId,
                course_id: courseId,
                certificate_number: certNumber,
                verification_code: verifyCode,
                issued_date: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                metadata: {
                    is_published: false,
                    issued_by: issuerId,
                    school_id: schoolId
                }
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);

        // 4. Generate PDF asynchronously
        this.generateAndStorePDF(cert.id, studentId, courseId);

        return cert;
    }

    async publishCertificate(id: string) {
        const supabase = await createClient();
        const { data: cert } = await supabase.from('certificates').select('metadata').eq('id', id).single();
        const newMetadata = { ...(cert?.metadata as any ?? {}), is_published: true };
        
        const { error } = await supabase
            .from('certificates')
            .update({ metadata: newMetadata })
            .eq('id', id);
            
        if (error) throw new AppError(error.message, 500);
        return { success: true };
    }

    private async generateAndStorePDF(certId: string, studentId: string, courseId: string) {
        try {
            const supabase = await createClient();
            const { data: user } = await supabase.from('portal_users').select('full_name').eq('id', studentId).single();
            const { data: course } = await supabase.from('courses').select('title').eq('id', courseId).single();
            const { data: cert } = await supabase.from('certificates').select('*').eq('id', certId).single();

            const pdfBuffer = await this.generatePDFBuffer(user?.full_name || 'Learner', course?.title || 'Course', cert);

            // Upload to storage
            const file = new File([new Uint8Array(pdfBuffer)], `certificate_${certId}.pdf`, { type: 'application/pdf' });
            const uploadedFile = await filesService.uploadFile(file, studentId);

            // Update certificate with PDF URL
            await supabase.from('certificates').update({ pdf_url: uploadedFile.storage_path }).eq('id', certId);

        } catch (error) {
            console.error('Failed to generate/store certificate PDF:', error);
        }
    }

    private async generatePDFBuffer(userName: string, courseName: string, cert: any): Promise<Buffer> {
        const fonts = {
            Helvetica: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique'
            }
        };
        const printer = new PdfPrinter(fonts);

        const docDefinition: TDocumentDefinitions = {
            content: [
                { text: 'RILLCOD TECHNOLOGIES', style: 'header', alignment: 'center', margin: [0, 50, 0, 20] },
                { text: 'CERTIFICATE OF COMPLETION', style: 'subheader', alignment: 'center', margin: [0, 0, 0, 50] },
                { text: 'This is to certify that', alignment: 'center', fontSize: 14 },
                { text: userName.toUpperCase(), style: 'name', alignment: 'center', margin: [0, 20, 0, 20] },
                { text: 'has successfully completed the course', alignment: 'center', fontSize: 14 },
                { text: courseName, style: 'course', alignment: 'center', margin: [0, 20, 0, 50] },
                {
                    columns: [
                        { text: `Date: ${cert.issued_date}`, alignment: 'left' },
                        { text: `Verification Code: ${cert.verification_code}`, alignment: 'right' }
                    ],
                    margin: [50, 0, 50, 0]
                },
                { text: `Certificate No: ${cert.certificate_number}`, alignment: 'center', margin: [0, 50, 0, 0], fontSize: 10, color: 'grey' }
            ],
            styles: {
                header: { fontSize: 32, bold: true, color: '#0f172a' },
                subheader: { fontSize: 18, bold: true, color: '#64748b', letterSpacing: 2 },
                name: { fontSize: 28, bold: true, color: '#0d9488' },
                course: { fontSize: 24, bold: true, italics: true, color: '#0f172a' }
            },
            defaultStyle: { font: 'Helvetica' },
            pageSize: 'A4',
            pageOrientation: 'landscape'
        };

        return new Promise((resolve, reject) => {
            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            const chunks: any[] = [];
            pdfDoc.on('data', (chunk: any) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', (err: any) => reject(err));
            pdfDoc.end();
        });
    }

    async verifyCertificate(code: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('certificates')
            .select('*, portal_users(full_name), courses(title)')
            .eq('verification_code', code)
            .single();

        if (error || !data) throw new NotFoundError('Certificate not found');
        return data;
    }
}

export const certificateService = new CertificateService();
