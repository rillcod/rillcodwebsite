import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { certificateService } from '@/services/certificate.service';
import { AppError } from '@/lib/errors';

async function listHandler(req: Request, ctx: ApiContext) {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { role, id } = ctx.user!;

    let query = supabase.from('certificates').select(`
        id,
        certificate_number,
        verification_code,
        issued_date,
        template_id,
        metadata,
        created_at,
        courses!course_id(title, program:programs!program_id(name)), 
        portal_users!portal_user_id(full_name, school_name, section_class)
    `);

    if (role === 'student') {
        // Students only see their own PUBLISHED certificates
        query = query.eq('portal_user_id', id).eq('metadata->>is_published', 'true');
    } else if (role === 'school') {
        // School Owners see all certificates for their school
        if (ctx.user?.tenantId) {
            query = query.eq('metadata->>school_id', ctx.user.tenantId);
        } else {
            return NextResponse.json({ success: true, data: [] });
        }
    } else if (role === 'teacher') {
        // Teachers see certificates for students in their assigned schools.
        // Build school ID set from tenantId + teacher_schools in parallel.
        const [{ data: teacherSchools }] = await Promise.all([
            supabase.from('teacher_schools').select('school_id').eq('teacher_id', id),
        ]);

        const sIds = (teacherSchools ?? []).map((s: any) => s.school_id).filter(Boolean);
        if (ctx.user?.tenantId && !sIds.includes(ctx.user.tenantId)) {
            sIds.push(ctx.user.tenantId);
        }
        const uniqueIds = Array.from(new Set(sIds));

        if (uniqueIds.length > 0) {
            query = query.in('metadata->>school_id', uniqueIds);
        } else {
            return NextResponse.json({ success: true, data: [] });
        }
    } else if (role === 'admin') {
        // Admin sees everything
    } else {
        return NextResponse.json({ success: true, data: [] });
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data });
}

async function verifyHandler(req: Request, ctx: ApiContext) {
    const code = ctx.params?.code;
    if (!code) throw new AppError('Verification code missing', 400);
    const cert = await certificateService.verifyCertificate(code);
    return NextResponse.json({ success: true, data: cert });
}

async function issueHandler(req: Request, ctx: ApiContext) {
    try {
        const { role } = ctx.user!;
        if (role !== 'admin' && role !== 'teacher') throw new AppError('Unauthorized', 403);

        const body = await req.json();
        const { studentId, courseId, schoolId, isBulk, classId } = body;
        
        if (isBulk) {
            if (!classId || !courseId) throw new AppError('Missing classId or courseId', 400);
            const result = await certificateService.bulkIssue(classId, courseId, ctx.user!.id, schoolId);
            return NextResponse.json({ success: true, data: result });
        } else {
            if (!studentId || !courseId) throw new AppError('Missing studentId or courseId', 400);
            const cert = await certificateService.issueCertificate(studentId, courseId, ctx.user!.id, schoolId);
            return NextResponse.json({ success: true, data: cert });
        }
    } catch (err: any) {
        console.error('Certificate Issue Error:', err);
        throw err;
    }
}

export const GET = (req: any, ctx: any) => {
    if (ctx.params?.code) return withApiProxy(verifyHandler)(req, ctx);
    return withApiProxy(listHandler)(req, ctx);
};

export const POST = withApiProxy(issueHandler);
