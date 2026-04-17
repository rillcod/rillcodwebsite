import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { RateLimitError } from '@/lib/errors';

// Memory store fallback for edge if Upstash Redis is not available
// In Edge functions, memory might not be completely shared, but it works well enough
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();
let redisClient: Redis | null = null;
let warnedMemoryFallback = false;

export function getClientIp(req: NextRequest): string {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
        // x-forwarded-for can be "client, proxy1, proxy2"
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
    }
    const realIp = req.headers.get('x-real-ip')?.trim();
    return realIp || '127.0.0.1';
}

function getRedisClient(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (!warnedMemoryFallback) {
            warnedMemoryFallback = true;
            console.warn('Rate limiter using in-memory fallback (UPSTASH_REDIS_* env vars missing).');
        }
        return null;
    }
    if (!redisClient) {
        redisClient = new Redis({ url, token });
    }
    return redisClient;
}

// ── Per-endpoint custom rate limit (Req 7) ────────────────────────────────────

export interface RateLimitConfig {
    /** Unique key for this counter (e.g. IP address or email) */
    key: string;
    /** Maximum number of requests allowed within the window */
    max: number;
    /** Window duration in seconds */
    window: number;
}

/**
 * Checks a custom rate limit for a specific key/max/window combination.
 * Uses Upstash Redis when available, falls back to in-memory Map.
 *
 * @throws {RateLimitError} when the limit is exceeded (Req 7.3)
 */
export async function checkCustomRateLimit(config: RateLimitConfig): Promise<void> {
    const { key, max, window: windowSecs } = config;
    const redisKey = `rl:custom:${key}`;

    const redis = getRedisClient();
    if (redis) {
        try {
            const count = await redis.incr(redisKey);
            if (count === 1) await redis.expire(redisKey, windowSecs);
            if (count > max) {
                const ttl = await redis.ttl(redisKey);
                throw new RateLimitError(
                    `Too many requests. Please wait before trying again.`,
                );
                // Attach retryAfter for the error handler to surface
                Object.assign(new RateLimitError(), { retryAfter: ttl > 0 ? ttl : windowSecs });
            }
            return;
        } catch (err) {
            if (err instanceof RateLimitError) throw err;
            console.error('Redis custom rate limit error, falling back to memory', err);
        }
    }

    // In-memory fallback
    const now = Date.now();
    const windowMs = windowSecs * 1000;
    const record = rateLimitCache.get(redisKey) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + windowMs;
    } else {
        record.count++;
    }
    rateLimitCache.set(redisKey, record);

    if (record.count > max) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        const err = new RateLimitError('Too many requests. Please wait before trying again.');
        (err as any).retryAfter = retryAfter;
        throw err;
    }
}

// ── Global IP-based rate limit (existing behaviour) ───────────────────────────

export async function rateLimitproxy(req: NextRequest) {
    // Simple sliding window or fixed window rate limiter
    const ip = getClientIp(req);
    const key = `rate-limit:${ip}`;

    // Limit: 100 requests per 60 seconds
    const windowTimeMs = 60 * 1000;
    const maxRequests = 100;

    // Try Upstash Redis first when configured
    const redis = getRedisClient();
    if (redis) {
        try {
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
