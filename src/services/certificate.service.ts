import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { filesService } from './files.service';
import { renderPdfToBuffer } from '@/lib/pdfmake-server';
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

    /**
     * The database function reports eligibility rather than raising, so that a
     * learner who has not finished or has not reached the pass mark can never
     * abort the publication that triggered the check. A direct request here is
     * an explicit ask to issue, so an ineligible outcome is surfaced as a
     * refusal with its stated reason.
     */
    async issueCertificate(studentId: string, courseId: string, issuerId?: string, _schoolId?: string, classId?: string) {
        const { data, error } = await (adminClient() as any).rpc('issue_verified_academic_certificate', {
            p_student_id: studentId,
            p_course_id: courseId,
            p_actor_id: issuerId ?? null,
            p_class_id: classId ?? null,
        });
        if (error) throw new AppError(error.message, 400);
        const status = (data as any)?.status;
        if (status && !['issued', 'already_issued'].includes(status)) {
            throw new AppError((data as any)?.reason ?? 'This learner is not eligible for a certificate yet.', 409);
        }
        return data;
    }

    async processPendingCertificates() {
        const admin = adminClient();
        // A revoked certificate must never gain a PDF: it would produce a
        // downloadable document for a withdrawn award.
        const { data: pending } = await admin
            .from('certificates')
            .select('*')
            .is('pdf_url', null)
            .neq('completion_status', 'revoked')
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
            students.map(student => this.issueCertificate(student.id, courseId, issuerId, schoolId, classId))
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

            // Also notify linked parents (studentId here is portal_users.id)
            const { getParentsForStudentPortalId } = await import('@/lib/parents/links');
            const parents = await getParentsForStudentPortalId(admin as any, studentId);
            for (const parent of parents) {
                if (parent.email) {
                    await notificationsService.sendCategorisedEmail({
                        userId: parent.id,
                        to: parent.email,
                        subject: `${user?.full_name}'s Course Certificate is Ready`,
                        html: `<p>Hi ${parent.full_name || 'Parent'},</p><p>We are pleased to inform you that <b>${user?.full_name}</b> has completed the course <b>${course?.title || 'the course'}</b> and received a certificate.</p><p><a href="/dashboard/certificates">View Certificates</a></p>`,
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

        return renderPdfToBuffer(docDefinition);
    }

    async verifyCertificate(code: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('certificates')
            .select('*, portal_users!certificates_portal_user_id_fkey(full_name), courses(title)')
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
