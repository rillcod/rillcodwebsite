import { Redis } from '@upstash/redis';
import { env } from '@/config/env';

export interface NotificationJob {
    id: string;
    userId: string;
    type: 'email'; // Req 14: SMS and WhatsApp are not supported — email only
    payload: any;
    attempts: number;
    timestamp: number;
}

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

const QUEUE_KEY = 'notification_queue';

export class QueueService {
    async queueNotification(userId: string, type: 'email', payload: any, attempts: number = 0) {
        if (!redis) {
            console.warn('Redis not configured, skipping queue');
            return null;
        }

        const job: NotificationJob = {
            id: crypto.randomUUID(),
            userId,
            type,
            payload,
            attempts,
            timestamp: Date.now()
        };

        await redis.rpush(QUEUE_KEY, JSON.stringify(job));
        return job.id;
    }

    async popNotification(): Promise<NotificationJob | null> {
        if (!redis) return null;
        const data = await redis.lpop(QUEUE_KEY);
        return data ? (data as NotificationJob) : null;
    }

    async getQueueLength(): Promise<number> {
        if (!redis) return 0;
        return await redis.llen(QUEUE_KEY);
    }
}

export const queueService = new QueueService();
