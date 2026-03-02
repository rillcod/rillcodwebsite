import { NextRequest, NextResponse } from 'next/server';

// Memory store fallback for edge if Upstash Redis is not available
// In Edge functions, memory might not be completely shared, but it works well enough
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

export async function rateLimitproxy(req: NextRequest) {
    // Simple sliding window or fixed window rate limiter
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    const key = `rate-limit:${ip}`;

    // Limit: 100 requests per 60 seconds
    const windowTimeMs = 60 * 1000;
    const maxRequests = 100;

    // Try to use true Upstash Redis if available:
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
            const { Redis } = await import('@upstash/redis');
            const redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });

            const currentCount = await redis.incr(key);
            if (currentCount === 1) {
                await redis.expire(key, 60);
            }

            const headers = new Headers();
            headers.set('X-RateLimit-Limit', maxRequests.toString());
            headers.set('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount).toString());

            if (currentCount > maxRequests) {
                return NextResponse.json(
                    { error: 'Too many requests, please try again later' },
                    { status: 429, headers }
                );
            }

            return null; // Signals OK
        } catch (err) {
            console.error('Redis rate limit error, falling back to memory', err);
        }
    }

    // Fallback to memory
    const now = Date.now();
    const record = rateLimitCache.get(key) || { count: 0, resetTime: now + windowTimeMs };

    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + windowTimeMs;
    } else {
        record.count++;
    }

    rateLimitCache.set(key, record);

    if (record.count > maxRequests) {
        return NextResponse.json(
            { error: 'Too many requests, please try again later' },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': maxRequests.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(Math.ceil((record.resetTime - now) / 1000))
                }
            }
        );
    }

    return null;
}
