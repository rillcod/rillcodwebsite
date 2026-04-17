import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { filesService } from './files.service';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

function adminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export class CertificateService {
    private async generateUniqueCertificateNumber() {
        for (let i = 0; i < 8; i += 1) {
            const code = `RC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            const { data } = await adminClient().from('certificates').select('id').eq('certificate_number', code).maybeSingle();
            if (!data?.id) return code;
        }
        return `RC-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }

    private async generateUniqueVerificationCode() {
        for (let i = 0; i < 8; i += 1) {
            const code = Math.random().toString(36).substring(2, 12).toUpperCase();
            const { data } = await adminClient().from('certificates').select('id').eq('verification_code', code).maybeSingle();
            if (!data?.id) return code;
        }
        return Math.random().toString(36).substring(2, 14).toUpperCase();
    }

    async issueCertificate(studentId: string, courseId: string, issuerId?: string, schoolId?: string) {
        // 1. Verify eligibility (check if student already has it to avoid duplicates)
        const { data: existing } = await adminClient()
            .from('certificates')
            .select('id')
            .eq('portal_user_id', studentId)
            .eq('course_id', courseId)
            .maybeSingle();

        if (existing) return existing; // Skip if already issued

        // 2. Generate unique numbers
        const certNumber = await this.generateUniqueCertificateNumber();
        const verifyCode = await this.generateUniqueVerificationCode();

        // 3. Create record
        const { data: cert, error } = await adminClient()
            .from('certificates')
            .insert([{
                portal_user_id: studentId,
                course_id: courseId,
                certificate_number: certNumber,
                verification_code: verifyCode,
                issued_date: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                metadata: {
                    is_published: true,
                    status: 'issued',
                    pdf_status: 'pending',
                    issued_by: issuerId,
                    school_id: schoolId
                }
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);

        // 4. PDF will be picked up by cron or triggered separately
        return cert;
    }

    async processPendingCertificates() {
        const admin = adminClient();
        const { data: pending } = await admin
            .from('certificates')
            .select('*')
            .is('pdf_url', null)
            .limit(10);

        if (!pending || pending.length === 0) return { processed: 0 };

        const results = await Promise.allSettled(
            pending.map(cert => this.generateAndStorePDF(cert.id, cert.portal_user_id!, cert.course_id!))
        );

        return {
            processed: results.filter(r => r.status === 'fulfilled').length,
            failed: results.filter(r => r.status === 'rejected').length
        };
    }

    async bulkIssue(classId: string, courseId: string, issuerId?: string, schoolId?: string) {
        const admin = adminClient();

        // 1. Get all students in the class
        const { data: students } = await admin
            .from('portal_users')
            .select('id')
            .eq('class_id', classId)
            .eq('role', 'student');

        if (!students || students.length === 0) throw new AppError('No students found in this class', 404);

        // 2. Issue certificates in parallel
        const settled = await Promise.allSettled(
            students.map(student => this.issueCertificate(student.id, courseId, issuerId, schoolId))
        );
        const count = settled.filter(r => r.status === 'fulfilled').length;
        settled.filter(r => r.status === 'rejected').forEach((r, i) => {
            console.error(`Failed to issue cert for student ${students[i].id}:`, (r as PromiseRejectedResult).reason);
        });

        return { count, total: students.length };
    }

    async publishCertificate(id: string) {
        const admin = adminClient();
        const { data: cert } = await admin.from('certificates').select('metadata').eq('id', id).single();
        const newMetadata = { ...(cert?.metadata as Record<string, unknown> ?? {}), is_published: true };

        const { error } = await admin
            .from('certificates')
            .update({ metadata: newMetadata })
            .eq('id', id);

        if (error) throw new AppError(error.message, 500);
        return { success: true };
    }

    private async generateAndStorePDF(certId: string, studentId: string, courseId: string) {
        try {
            const admin = adminClient();
            const { data: user } = await admin.from('portal_users').select('full_name, email, school_id').eq('id', studentId).single();
            const { data: course } = await admin.from('courses').select('title').eq('id', courseId).single();
            const { data: cert } = await admin.from('certificates').select('*').eq('id', certId).single();

            const pdfBuffer = await this.generatePDFBuffer(user?.full_name || 'Learner', course?.title || 'Course', cert);

            // Upload to storage
            const file = new File([new Uint8Array(pdfBuffer)], `certificate_${certId}.pdf`, { type: 'application/pdf' });
            const uploadedFile = await filesService.uploadFile(file, studentId, user?.school_id ?? undefined);

            // Update certificate with PDF URL
            await adminClient().from('certificates').update({
                pdf_url: uploadedFile.storage_path,
                metadata: { ...(cert?.metadata as Record<string, unknown> ?? {}), pdf_status: 'generated' },
            }).eq('id', certId);

            // 5. Notifications
            const { notificationsService } = await import('./notifications.service');
            if (user?.email) {
                await notificationsService.sendCategorisedEmail({
                    userId: studentId,
                    to: user.email,
                    subject: `Congratulations! Your certificate for ${course?.title || 'the course'} is ready`,
                    html: `<p>Hi ${user.full_name},</p><p>You have successfully completed <b>${course?.title || 'the course'}</b>. Your certificate is now available and can be downloaded from your dashboard.</p><p><a href="/dashboard/certificates">View Certificates</a></p>`,
                    category: 'report_published',
                    eventType: 'certificate_generated',
                    referenceId: certId,
                });
            }

            // Also notify linked parents
            const { data: links } = await admin.from('parent_student_links').select('parent_id, portal_users!parent_id(email, full_name)').eq('student_id', studentId);
            for (const link of links ?? []) {
                const parent = (link.portal_users as any);
                if (parent?.email) {
                    await notificationsService.sendCategorisedEmail({
                        userId: link.parent_id!,
                        to: parent.email,
                        subject: `${user?.full_name}'s Course Certificate is Ready`,
                        html: `<p>Hi ${parent.full_name},</p><p>We are pleased to inform you that <b>${user?.full_name}</b> has completed the course <b>${course?.title || 'the course'}</b> and received a certificate.</p><p><a href="/dashboard/certificates">View Certificates</a></p>`,
                        category: 'report_published',
                        eventType: 'certificate_generated_parent',
                        referenceId: certId,
                    });
                }
            }

        } catch (error) {
            console.error('Failed to generate/store certificate PDF:', error);
            const { data: cert } = await adminClient().from('certificates').select('metadata').eq('id', certId).maybeSingle();
            await adminClient().from('certificates').update({
                metadata: { ...(cert?.metadata as Record<string, unknown> ?? {}), pdf_status: 'failed' },
            }).eq('id', certId);
        }
    }

    private async generatePDFBuffer(userName: string, courseName: string, cert: { issued_date: string; verification_code: string; certificate_number: string }): Promise<Buffer> {
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
            const chunks: Buffer[] = [];
            pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', (err: Error) => reject(err));
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
        return {
            certificate_number: data.certificate_number,
            issued_date: data.issued_date,
            student_name: (data as any).portal_users?.full_name ?? null,
            course_title: (data as any).courses?.title ?? null,
            is_published: ((data.metadata as Record<string, unknown> | null)?.is_published ?? false) === true,
        };
    }
}

export const certificateService = new CertificateService();
