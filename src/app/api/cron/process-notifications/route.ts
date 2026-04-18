import { NextResponse } from 'next/server';
import { queueService } from '@/services/queue.service';
import { notificationsService } from '@/services/notifications.service';

export const dynamic = 'force-dynamic';

async function handleRequest(req: Request) {
    // Simple "worker" that processes a batch of notifications when called
    // Suitable for serverless environments where long-running processes are difficult
    const authHeader = req.headers.get('authorization');
    const secret = (req.headers.get('x-cron-secret') ?? authHeader?.replace(/^Bearer\s+/i, '')) || '';
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const batchSize = 10;
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < batchSize; i++) {
        const job = await queueService.popNotification();
        if (!job) break;

        try {
            if (job.type === 'email') {
                await notificationsService.sendEmail(job.userId, job.payload);
            } else {
                // Req 14: only 'email' jobs are supported — discard anything else
                console.warn(`[process-notifications] Discarding unsupported job type "${(job as any).type}" (id: ${job.id})`);
                continue;
            }
            processed++;
        } catch (err) {
            console.error(`Failed job ${job.id}:`, err);
            failed++;
            // Simple retry: push back to end of queue if attempts < 3
            if (job.attempts < 3) {
                await queueService.queueNotification(job.userId, 'email', job.payload, job.attempts + 1);
            }
        }
    }

    return NextResponse.json({
        success: true,
        processed,
        failed,
        remaining: await queueService.getQueueLength()
    });
}

export async function GET(req: Request) { return handleRequest(req); }
export async function POST(req: Request) { return handleRequest(req); }
