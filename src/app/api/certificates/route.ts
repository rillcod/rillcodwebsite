import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { certificateService } from '@/services/certificate.service';
import { AppError } from '@/lib/errors';

async function listHandler(req: Request, ctx: ApiContext) {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { role, id } = ctx.user!;

    // 1. School Owners have NO access
    if (role === 'school') {
        return NextResponse.json({ success: true, data: [] });
    }

    let query = supabase.from('certificates').select('*, courses(title), portal_users(full_name)');

    if (role === 'student') {
        // Students only see their own PUBLISHED certificates
        query = query.eq('portal_user_id', id).eq('metadata->>is_published', 'true');
    } else if (role === 'teacher') {
        // Teachers see certificates for students in their assigned schools
        const { data: schools } = await supabase.from('teacher_schools').select('school_id').eq('teacher_id', id);
        const sIds = schools?.map(s => s.school_id) || [];
        if (sIds.length > 0) {
            query = query.in('metadata->>school_id', sIds);
        } else {
            return NextResponse.json({ success: true, data: [] });
        }
    } else if (role === 'admin') {
        // Admin sees everything
    } else {
        return NextResponse.json({ success: true, data: [] });
    }

    const { data, error } = await query.order('created_at', { ascending: false });

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
    const { studentId, courseId, schoolId } = await req.json();
    if (!studentId || !courseId) throw new AppError('Missing studentId or courseId', 400);
    const cert = await certificateService.issueCertificate(studentId, courseId, ctx.user!.id, schoolId);
    return NextResponse.json({ success: true, data: cert });
}

export const GET = (req: any, ctx: any) => {
    if (ctx.params?.code) return withApiProxy(verifyHandler)(req, ctx);
    return withApiProxy(listHandler)(req, ctx);
};

export const POST = withApiProxy(issueHandler);
