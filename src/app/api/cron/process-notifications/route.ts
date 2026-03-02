import { NextResponse } from 'next/server';
import { queueService } from '@/services/queue.service';
import { notificationsService } from '@/services/notifications.service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    // Simple "worker" that processes a batch of notifications when called
    // Suitable for serverless environments where long-running processes are difficult
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
            } else if (job.type === 'sms') {
                await notificationsService.sendSMS(job.userId, job.payload);
            }
            processed++;
        } catch (err) {
            console.error(`Failed job ${job.id}:`, err);
            failed++;
            // Simple retry: push back to end of queue if attempts < 3
            if (job.attempts < 3) {
                job.attempts++;
                await queueService.queueNotification(job.userId, job.type, job.payload);
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
