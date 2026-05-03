import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { filesService } from '@/services/files.service';

async function downloadHandler(req: Request, ctx: ApiContext) {
    const certId = ctx.params!.id;
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    // 1. Fetch certificate to get pdf_url (storage_path)
    const { data: cert, error } = await supabase
        .from('certificates')
        .select('*, portal_users(id, full_name)')
        .eq('id', certId)
        .single();

    if (error || !cert) throw new AppError('Certificate not found', 404);
    if (!cert.pdf_url) throw new AppError('PDF not yet generated', 400);

    // 2. Authorization check
    const { user } = ctx;
    if (user?.role === 'student' && cert.portal_user_id !== user.id) {
        throw new AppError('Unauthorized', 403);
    }
    // Staff must be scoped to the certificate's school (same pattern as GET handler)
    if (user?.role && !['student', 'admin'].includes(user.role)) {
        const certSchool = ((cert.metadata as Record<string, unknown> | null)?.school_id as string | undefined) || null;
        if (certSchool) {
            const scopedIds = new Set<string>();
            if (user.tenantId) scopedIds.add(user.tenantId);
            const { createClient: createSC } = await import('@/lib/supabase/server');
            const sc = await createSC();
            const { data: tsRows } = await sc.from('teacher_schools').select('school_id').eq('teacher_id', user.id);
            for (const r of tsRows ?? []) {
                const sid = (r as { school_id: string | null }).school_id;
                if (sid) scopedIds.add(sid);
            }
            if (!scopedIds.has(certSchool)) throw new AppError('Unauthorized', 403);
        }
    }

    // 3. Generate signed URL from R2 (via filesService logic or directly)
    // filesService.generateSignedUrl expects a file RECORD ID, but we have a storage_path.
    // Let's use r2SignedUrl from @/lib/r2/client directly.
    const { r2SignedUrl } = await import('@/lib/r2/client');
    const fullName = cert.portal_users?.full_name || 'Certificate';
    const signedUrl = await r2SignedUrl(cert.pdf_url, 3600, `Certificate_${fullName.replace(/\s+/g, '_')}.pdf`);

    return NextResponse.json({ success: true, url: signedUrl });
}

export const GET = withApiProxy(downloadHandler);
