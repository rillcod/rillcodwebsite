import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { certificateService } from '@/services/certificate.service';
import { AppError } from '@/lib/errors';

async function publishHandler(req: Request, ctx: ApiContext) {
    const certId = ctx.params!.id;
    const { role } = ctx.user!;

    if (role !== 'admin' && role !== 'teacher') throw new AppError('Unauthorized', 403);
    
    const result = await certificateService.publishCertificate(certId);
    return NextResponse.json(result);
}

export const PATCH = withApiProxy(publishHandler);
