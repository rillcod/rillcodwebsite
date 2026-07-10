import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueService } from '@/services/queue.service';
import { notificationsService } from '@/services/notifications.service';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { publishDueNewsletters } from '@/lib/newsletters/push';
import { processWhatsAppOutbox } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

async function handleRequest(req: Request) {
    if (!isValidCronSecret(extractCronSecret(req))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Piggyback: publish any newsletters whose scheduled time has passed. Best-effort — never
    // let it block the notification queue. Avoids needing a separate cron entry.
    let newslettersPublished = 0;
    try {
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        newslettersPublished = (await publishDueNewsletters(admin)).count;
    } catch (err) {
        console.error('[process-notifications] newsletter publish sweep failed:', err);
    }

    let whatsapp = { processed: 0, sent: 0, retried: 0, failed: 0, unavailable: false };
    try {
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        whatsapp = await processWhatsAppOutbox(admin, 25);
    } catch (err) {
        console.error('[process-notifications] WhatsApp outbox sweep failed:', err);
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
        newslettersPublished,
        whatsapp,
        remaining: await queueService.getQueueLength()
    });
}

export async function GET(req: Request) { return handleRequest(req); }
export async function POST(req: Request) { return handleRequest(req); }
