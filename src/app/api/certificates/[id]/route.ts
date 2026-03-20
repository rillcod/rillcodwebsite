import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { certificateService } from '@/services/certificate.service';
import { AppError } from '@/lib/errors';

// GET /api/certificates/[id] - Get individual certificate detail
async function getHandler(req: Request, ctx: ApiContext) {
    const certId = ctx.params!.id;
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data: cert, error } = await supabase
        .from('certificates')
        .select(`
            *,
            portal_users(id, full_name, section_class, school_name),
            courses(id, title)
        `)
        .eq('id', certId)
        .single();

    if (error) throw new AppError('Certificate not found', 404);
    
    // Authorization: User can see their own, but staff can see all within scope
    const { user } = ctx;
    if (user?.role === 'student' && cert.portal_user_id !== user.id) {
        throw new AppError('Unauthorized', 403);
    }
    
    return NextResponse.json({ success: true, data: cert });
}

// PATCH /api/certificates/[id] - Update or Publish
async function updateHandler(req: Request, ctx: ApiContext) {
    const certId = ctx.params!.id;
    const { role } = ctx.user!;

    if (role !== 'admin' && role !== 'teacher' && role !== 'school') throw new AppError('Unauthorized', 403);
    
    let body: any = {};
    try {
        body = await req.json();
    } catch (e) {
        // Empty body is fine for simple publish
    }
    
    // If it's only a publish request (empty body or specific flag)
    if (Object.keys(body).length === 0 || body.publish === true) {
        const result = await certificateService.publishCertificate(certId);
        return NextResponse.json(result);
    }

    // Otherwise, generic update
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    
    const { data, error } = await supabase
        .from('certificates')
        .update(body)
        .eq('id', certId)
        .select()
        .single();
        
    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data });
}

// DELETE /api/certificates/[id] - Revoke
async function deleteHandler(req: Request, ctx: ApiContext) {
    const certId = ctx.params!.id;
    const { role } = ctx.user!;

    // Allow both admin and teacher to delete for full CRUD
    if (role !== 'admin' && role !== 'teacher') {
        throw new AppError('Unauthorized', 403);
    }
    
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    
    const { error } = await supabase.from('certificates').delete().eq('id', certId);
    if (error) throw new AppError(error.message, 500);
    
    return NextResponse.json({ success: true, message: 'Certificate revoked and deleted' });
}

export const GET = withApiProxy(getHandler);
export const PATCH = withApiProxy(updateHandler);
export const DELETE = withApiProxy(deleteHandler);
