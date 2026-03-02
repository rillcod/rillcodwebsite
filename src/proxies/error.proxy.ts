import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export function generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function errorHandler(error: Error): Response {
    // Log error to monitoring service
    if (error instanceof AppError) {
        if (!error.isOperational) {
            // Log to Sentry for unexpected errors
            logger.logError(error, { source: 'error.proxy', type: 'unexpected' });
        }

        return NextResponse.json({
            success: false,
            error: error.message,
            errors: error.errors,
            statusCode: error.statusCode,
            requestId: generateRequestId(),
            timestamp: new Date().toISOString(),
        }, { status: error.statusCode });
    }

    // Unhandled error - log and return generic message
    logger.logError(error, { source: 'error.proxy', type: 'unhandled' });

    return NextResponse.json({
        success: false,
        error: 'An unexpected error occurred',
        statusCode: 500,
        requestId: generateRequestId(),
        timestamp: new Date().toISOString(),
    }, { status: 500 });
}
