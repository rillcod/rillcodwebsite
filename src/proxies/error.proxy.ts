import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Correlation id for one failed request.
 *
 * Math.random is fine here: this identifies a log line, it does not authorise
 * anything. crypto.randomUUID is used where available because it is shorter to read
 * aloud down a phone line, which is how these actually get reported.
 */
export function generateRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Turns a thrown error into the response the customer sees, and the log line
 * support needs to explain it.
 *
 * Two things were wrong here.
 *
 * The request id was generated inside the response object, after the error had
 * already been logged without one. A customer quoting "I got error abc123" was
 * quoting a number that appeared nowhere in any log — the one field whose entire
 * purpose is correlation correlated with nothing. It is now generated once, logged,
 * and returned.
 *
 * And an AppError returned its own message whether or not it was operational. An
 * operational error is written for the customer ("That form has already been
 * signed"); a non-operational one is a bug, and its message is written for us. Those
 * were going out to the public unchanged. Non-operational errors now get the same
 * generic sentence as an unhandled crash, with the detail kept in the log.
 */
export function errorHandler(error: Error): Response {
    const requestId = generateRequestId();
    const timestamp = new Date().toISOString();

    if (error instanceof AppError && error.isOperational) {
        // Written for the customer, and safe to show them.
        logger.logError(error, { source: 'error.proxy', type: 'operational', requestId });

        return NextResponse.json({
            success: false,
            error: error.message,
            errors: error.errors,
            statusCode: error.statusCode,
            requestId,
            timestamp,
        }, { status: error.statusCode });
    }

    // Either a non-operational AppError or something entirely unhandled. Both are
    // bugs, and neither message is meant for a customer to read.
    logger.logError(error, {
        source: 'error.proxy',
        type: error instanceof AppError ? 'unexpected' : 'unhandled',
        requestId,
    });

    const statusCode = error instanceof AppError ? error.statusCode : 500;

    return NextResponse.json({
        success: false,
        error: 'Something went wrong on our side. Quote this reference if you contact support.',
        statusCode,
        requestId,
        timestamp,
    }, { status: statusCode });
}
