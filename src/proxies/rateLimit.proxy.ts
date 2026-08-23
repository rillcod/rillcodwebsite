import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { RateLimitError } from '@/lib/errors';
import { resolveUpstashConfig } from '@/lib/redis-config';
import {
    isSafeApiMethod,
    loadTrafficControls,
    mutationRouteFamily,
} from '@/lib/operations/traffic-controls';

// Memory store fallback for edge if Upstash Redis is not available
// In Edge functions, memory might not be completely shared, but it works well enough
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();
let redisClient: Redis | null = null;
let redisInitFailed = false;
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

/**
 * Never throws. A missing or malformed UPSTASH_REDIS_REST_URL must degrade to
 * the in-memory limiter, not 500 the endpoint being rate-limited.
 */
function getRedisClient(): Redis | null {
    if (redisClient) return redisClient;
    if (redisInitFailed) return null;

    const config = resolveUpstashConfig(
        process.env.UPSTASH_REDIS_REST_URL,
        process.env.UPSTASH_REDIS_REST_TOKEN,
        'rate-limit',
    );
    if (!config) {
        redisInitFailed = true;
        if (!warnedMemoryFallback) {
            warnedMemoryFallback = true;
            console.warn('Rate limiter using in-memory fallback (UPSTASH_REDIS_* env vars missing or invalid).');
        }
        return null;
    }

    try {
        redisClient = new Redis(config);
    } catch (err) {
        redisInitFailed = true;
        console.warn('Rate limiter using in-memory fallback (Upstash Redis init failed).', err);
        return null;
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
                const err = new RateLimitError('Too many requests. Please wait before trying again.');
                // Attach retryAfter for the error handler to surface
                (err as any).retryAfter = ttl > 0 ? ttl : windowSecs;
                throw err;
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

export async function rateLimitproxy(req: NextRequest, authenticatedUserId?: string) {
    // Public verification and registration routes use checkCustomRateLimit with
    // their own tighter policy. The shared wrapper protects writes only, so
    // polling/read-heavy dashboards and schools behind one NAT are not blocked.
    if (isSafeApiMethod(req.method)) return null;

    const controls = await loadTrafficControls();
    if (!controls.api_mutation_rate_limit_enabled) return null;

    const identity = authenticatedUserId
        ? `user:${authenticatedUserId}`
        : `ip:${getClientIp(req)}`;
    const family = mutationRouteFamily(req.nextUrl.pathname);
    const key = `rl:mutation:${family}:${identity}`;
    const windowSeconds = controls.api_mutation_window_seconds;
    const windowTimeMs = windowSeconds * 1000;
    const maxRequests = controls.api_mutation_requests_per_window;

    // Try Upstash Redis first when configured
    const redis = getRedisClient();
    if (redis) {
        try {
            const currentCount = await redis.incr(key);
            if (currentCount === 1) {
                await redis.expire(key, windowSeconds);
            }

            const headers = new Headers();
            headers.set('X-RateLimit-Limit', maxRequests.toString());
            headers.set('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount).toString());

            if (currentCount > maxRequests) {
                return NextResponse.json(
                    { error: 'Too many requests, please try again later' },
                    {
                        status: 429,
                        headers: {
                            ...Object.fromEntries(headers.entries()),
                            'Retry-After': String(Math.max(1, await redis.ttl(key))),
                        },
                    }
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
                    'X-RateLimit-Reset': String(Math.ceil(record.resetTime / 1000)),
                    'Retry-After': String(Math.max(1, Math.ceil((record.resetTime - now) / 1000))),
                }
            }
        );
    }

    return null;
}
