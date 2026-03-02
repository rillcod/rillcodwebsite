import { Redis } from '@upstash/redis';

// Only create a Redis instance if we have credentials
let redis: Redis | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
} else {
    console.warn('Upstash Redis credentials are not configured. Using in-memory fallback for caching and rate limiting.');
}

// Simple in-memory fallback store
const memoryStore = new Map<string, { value: any; expiry: number | null }>();

export const cacheConfig = {
    defaultTTL: 3600, // 1 hour
};

export const redisCache = {
    async get<T>(key: string): Promise<T | null> {
        if (redis) {
            return await redis.get<T>(key);
        }

        // In-memory fallback logic
        const item = memoryStore.get(key);
        if (!item) return null;
        if (item.expiry && Date.now() > item.expiry) {
            memoryStore.delete(key);
            return null;
        }
        return item.value as T;
    },

    async set<T>(key: string, value: T, ttlSeconds: number = cacheConfig.defaultTTL): Promise<void> {
        if (redis) {
            await redis.set(key, value, { ex: ttlSeconds });
            return;
        }

        const expiry = Date.now() + (ttlSeconds * 1000);
        memoryStore.set(key, { value, expiry });
    },

    async del(key: string): Promise<void> {
        if (redis) {
            await redis.del(key);
            return;
        }

        memoryStore.delete(key);
    },

    // Rate Limiting specific helper methods (e.g. incr)
    async incr(key: string, ttlSeconds?: number): Promise<number> {
        if (redis) {
            if (ttlSeconds) {
                // Multi/pipeline isn't fully atomic across all steps unless executed. Just use incr + expire.
                // Simplified approach for edge Upstash: 
                const count = await redis.incr(key);
                if (count === 1) {
                    await redis.expire(key, ttlSeconds);
                }
                return count;
            }
            return await redis.incr(key);
        }

        // In-memory fallback
        const item = memoryStore.get(key);
        let count = 1;
        let expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null;

        if (item) {
            if (item.expiry && Date.now() > item.expiry) {
                // Expired, count remains 1 and expiry gets updated
            } else {
                count = Number(item.value) + 1;
                expiry = item.expiry; // Keep original expiry
            }
        }

        memoryStore.set(key, { value: count, expiry });
        return count;
    }
};
