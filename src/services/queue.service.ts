import { Redis } from '@upstash/redis';
import { env } from '@/config/env';
import { resolveUpstashConfig } from '@/lib/redis-config';

import { recordDeadLetter } from '@/lib/operations/dead-letter';
export interface NotificationJob {
    id: string;
    userId: string;
    type: 'email'; // Req 14: SMS and WhatsApp are not supported — email only
    payload: any;
    attempts: number;
    timestamp: number;
}

const redis = (() => {
    const config = resolveUpstashConfig(
        env.UPSTASH_REDIS_REST_URL,
        env.UPSTASH_REDIS_REST_TOKEN,
        'queue',
    );
    if (!config) return null;
    try {
        return new Redis(config);
    } catch (err) {
        console.warn('[queue] Upstash Redis init failed; queue disabled for this process.', err);
        return null;
    }
})();

const QUEUE_KEY = 'notification_queue';

export class QueueService {
    async queueNotification(userId: string, type: 'email', payload: any, attempts: number = 0) {
        const job: NotificationJob = {
            id: crypto.randomUUID(),
            userId,
            type,
            payload,
            attempts,
            timestamp: Date.now()
        };

        if (!redis) {
            console.warn('Redis not configured, preserving notification in the dead-letter queue');
            const preservedId = await recordDeadLetter({
                source: 'notification_queue_unavailable', jobType: type, originalJobId: job.id,
                userId, payload: payload && typeof payload === 'object' ? payload : { value: payload },
                error: 'Redis notification queue is not configured.', attempts,
            });
            if (!preservedId) throw new Error('Notification could not be queued or preserved for recovery.');
            return job.id;
        }

        try {
            await redis.rpush(QUEUE_KEY, JSON.stringify(job));
        } catch (queueError) {
            const message = queueError instanceof Error ? queueError.message : String(queueError);
            const preservedId = await recordDeadLetter({
                source: 'notification_queue_error', jobType: type, originalJobId: job.id,
                userId, payload: payload && typeof payload === 'object' ? payload : { value: payload },
                error: message, attempts,
            });
            if (!preservedId) throw new Error(`Notification queue and recovery storage failed: ${message}`);
        }
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
