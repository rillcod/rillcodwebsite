import { NextRequest, NextResponse } from 'next/server';
import { rateLimitproxy } from '@/proxies/rateLimit.proxy';
import { tenantproxy } from '@/proxies/tenant.proxy';
import { errorHandler } from '@/proxies/error.proxy';
import { withLogging } from '@/proxies/logging.proxy';
import { AppError, AuthenticationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface ApiContext {
    params?: any;
    user?: {
        id: string;
        role: string;
        tenantId?: string;
    };
}

export interface WrapperOptions {
    requireAuth?: boolean;
    requireTenant?: boolean;
    rateLimit?: boolean;
    roles?: string[];
}

type NextApiHandler = (req: NextRequest, ctx: ApiContext) => Promise<Response> | Response;

export function withApiProxy(
    handler: NextApiHandler,
    options: WrapperOptions = { requireAuth: true, requireTenant: false, rateLimit: true }
) {
    return async (req: NextRequest, ctx: ApiContext) => {
        const startTime = Date.now();
        let status = 200;

        try {
            // 1. Rate Limiting
            if (options.rateLimit !== false) {
                const rateLimitRes = await rateLimitproxy(req);
                if (rateLimitRes) {
                    status = rateLimitRes.status;
                    withLogging(req, startTime, status);
                    return rateLimitRes;
                }
            }

            // 2. Auth & Tenant Proxy
            if (options.requireAuth || options.requireTenant || options.roles) {
                let authRes = NextResponse.next();
                authRes = await tenantproxy(req, authRes);

                const userId = authRes.headers.get('x-user-id');
                const role = authRes.headers.get('x-user-role');
                const tenantId = authRes.headers.get('x-tenant-id') || undefined;

                if ((options.requireAuth || options.roles) && !userId) {
                    throw new AuthenticationError('Authentication required');
                }

                if (options.requireTenant && !tenantId) {
                    throw new AppError('Tenant context missing. You must belong to a school.', 403, true);
                }

                if (options.roles && role && !options.roles.includes(role)) {
                    throw new AppError(`Access denied. ${role}s are not allowed here.`, 403, true);
                }

                ctx.user = {
                    id: userId as string,
                    role: role as string,
                    tenantId
                };
            }

            // 3. Execute Handler
            const resolvedParams = await ctx.params;
            const resolvedCtx = { ...ctx, params: resolvedParams };
            const response = await handler(req, resolvedCtx);
            status = response.status;

            if (ctx.user?.role && ctx.user.role !== 'student' && req.method !== 'GET') {
                logger.info('ADMIN_ACTION', {
                    userId: ctx.user.id,
                    role: ctx.user.role,
                    method: req.method,
                    url: req.nextUrl.pathname,
                    status
                });
            }

            // Copy over rate limit headers or any other headers
            // Since it's Next.js App Router, we just return the final response
            withLogging(req, startTime, status, ctx.user?.id, ctx.user?.tenantId);
            return response;

        } catch (error: any) {
            const errResponse = errorHandler(error) as NextResponse;
            withLogging(req, startTime, errResponse.status, ctx.user?.id, ctx.user?.tenantId);
            return errResponse;
        }
    };
}
