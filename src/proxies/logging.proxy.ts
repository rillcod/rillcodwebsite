import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export function withLogging(req: NextRequest, startTime: number, status: number = 200) {
    const duration = Date.now() - startTime;

    // Basic structured logging
    const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.nextUrl.pathname,
        status,
        durationMs: duration,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userId: req.headers.get('x-user-id') || 'unauthenticated',
        tenantId: req.headers.get('x-tenant-id') || 'none',
    };

    logger.info('REQUEST', logData);

    // Log slow queries (> 1000ms)
    if (duration > 1000) {
        logger.logSlowRequest({
            ...logData,
            warning: 'SLOW_REQUEST'
        });
    }
}
