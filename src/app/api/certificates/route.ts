import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { certificateService } from '@/services/certificate.service';
import { AppError } from '@/lib/errors';

async function listHandler(req: Request, ctx: ApiContext) {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('certificates')
        .select('*, courses(title)')
        .eq('portal_user_id', ctx.user!.id);

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data });
}

async function verifyHandler(req: Request, ctx: ApiContext) {
    const code = ctx.params?.code;
    if (!code) throw new AppError('Verification code missing', 400);

    const cert = await certificateService.verifyCertificate(code);
    return NextResponse.json({ success: true, data: cert });
}

export const GET = (req: any, ctx: any) => {
    if (ctx.params?.code) {
        return withApiProxy(verifyHandler)(req, ctx);
    }
    return withApiProxy(listHandler)(req, ctx);
};
