import { queueService } from '@/services/queue.service';
import { notificationsService } from '@/services/notifications.service';

export async function startWorker() {
    console.log('🚀 Notification Worker Started');

    while (true) {
        try {
            const job = await queueService.popNotification();

            if (!job) {
                // Sleep for 5 seconds if queue is empty
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            console.log(`Processing job ${job.id} for user ${job.userId} (${job.type})`);

            try {
                if (job.type === 'email') {
                    await notificationsService.sendEmail(job.userId, job.payload);
                } else if (job.type === 'sms') {
                    await notificationsService.sendSMS(job.userId, job.payload);
                }
                console.log(`✅ Successfully processed job ${job.id}`);
            } catch (err: any) {
                console.error(`❌ Failed to process job ${job.id}: ${err.message}`);

                if (job.attempts < 3) {
                    job.attempts++;
                    // Re-queue with incremented attempts
                    await queueService.queueNotification(job.userId, job.type, job.payload);
                    console.log(`Re-queued job ${job.id}, attempt ${job.attempts}`);
                } else {
                    console.error(`Max attempts reached for job ${job.id}. Giving up.`);
                }
            }
        } catch (globalErr: any) {
            console.error('Critical Error in Notification Worker:', globalErr);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}
