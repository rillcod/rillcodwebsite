import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Validates a request body against a Zod schema
 */
export async function withValidation<T>(
    req: NextRequest,
    schema: z.ZodType<T>
): Promise<{ data: T | null; errorResponse: NextResponse | null }> {
    try {
        const rawData = await req.json();
        const result = schema.safeParse(rawData);

        if (!result.success) {
            return {
                data: null,
                errorResponse: NextResponse.json(
                    {
                        success: false,
                        error: 'Validation Error',
                        errors: result.error.issues.map(err => ({
                            path: err.path.join('.'),
                            message: err.message
                        }))
                    },
                    { status: 400 }
                )
            };
        }

        return { data: result.data, errorResponse: null };
    } catch (err) {
        return {
            data: null,
            errorResponse: NextResponse.json(
                { success: false, error: 'Invalid JSON payload' },
                { status: 400 }
            )
        };
    }
}
