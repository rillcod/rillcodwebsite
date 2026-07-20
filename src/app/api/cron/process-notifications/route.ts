import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueService } from '@/services/queue.service';
import { notificationsService } from '@/services/notifications.service';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { publishDueNewsletters } from '@/lib/newsletters/push';
import { processWhatsAppOutbox } from '@/lib/whatsapp/send';
import { runCommunicationFollowup } from '@/lib/communication/followup-runner';

import { loadOfficeAutomationControls, type OfficeAutomationControls } from '@/lib/communication/automation-controls';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { recordDeadLetter } from '@/lib/operations/dead-letter';
export const dynamic = 'force-dynamic';

async function handleRequest(req: Request) {
    if (!isValidCronSecret(extractCronSecret(req))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    let controls: OfficeAutomationControls | null = null;
    try {
        controls = await loadOfficeAutomationControls(admin as any);
    } catch (err) {
        // Fail closed for governed automation while leaving transactional delivery alive.
        console.error('[process-notifications] office automation controls unavailable:', err);
    }


    // Piggyback: publish any newsletters whose scheduled time has passed. Best-effort — never
    // let it block the notification queue. Avoids needing a separate cron entry.
    let newslettersPublished = 0;
    if (controls?.marketing_enabled && controls.newsletter_auto_publish_enabled) try {
        newslettersPublished = (await publishDueNewsletters(admin)).count;
    } catch (err) {
        console.error('[process-notifications] newsletter publish sweep failed:', err);
    }

    let whatsapp = { processed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0, unavailable: false };
    try {
        whatsapp = await processWhatsAppOutbox(admin, 25, { marketingEnabled: controls?.marketing_enabled === true });
    } catch (err) {
        console.error('[process-notifications] WhatsApp outbox sweep failed:', err);
    }

    const batchSize = 10;
    let processed = 0;
    let communicationFollowup = { success: true, checked: 0, reminded: 0, escalated: 0, failures: [] as string[] };
    if (controls?.customer_followup_enabled) try {
        communicationFollowup = await runCommunicationFollowup(admin);
    } catch (err) {
        communicationFollowup.success = false;
        communicationFollowup.failures.push('runner_failed');
        console.error('[process-notifications] communication follow-up sweep failed:', err);
    }

    let failed = 0;

    for (let i = 0; i < batchSize; i++) {
        const job = await queueService.popNotification();
        if (!job) break;

        try {
            if (job.type === 'email') {
                await notificationsService.sendEmail(job.userId, job.payload);
            } else {
                // Req 14: only 'email' jobs are supported — discard anything else
                const deadLetterId = await recordDeadLetter({
                    source: 'notification_queue', jobType: String((job as any).type), originalJobId: job.id,
                    userId: job.userId, payload: job.payload, error: `Unsupported notification job type: ${String((job as any).type)}`, attempts: job.attempts,
                });
                if (!deadLetterId) throw new Error(`Unsupported job ${job.id} could not be preserved for recovery.`);
                failed++;
                console.warn(`[process-notifications] Moved unsupported job type "${(job as any).type}" to recovery (id: ${job.id})`);
                continue;
            }
            processed++;
        } catch (err) {
            console.error(`Failed job ${job.id}:`, err);
            failed++;
            if (job.attempts < 3) {
                await queueService.queueNotification(job.userId, 'email', job.payload, job.attempts + 1);
            } else {
                const deadLetterId = await recordDeadLetter({
                    source: 'notification_queue', jobType: job.type, originalJobId: job.id,
                    userId: job.userId, payload: job.payload, error: err instanceof Error ? err.message : String(err), attempts: job.attempts + 1,
                });
                if (!deadLetterId) throw new Error(`Failed job ${job.id} could not be preserved for recovery.`);
            }
        }
    }

    return NextResponse.json({
        success: true,
        processed,
        failed,
        newslettersPublished,
        whatsapp,
        communicationFollowup,
        remaining: await queueService.getQueueLength()
    });
}

export async function GET(req: Request) { return runMonitoredCron('process-notifications', 1, () => handleRequest(req)); }
export async function POST(req: Request) { return runMonitoredCron('process-notifications', 1, () => handleRequest(req)); }
