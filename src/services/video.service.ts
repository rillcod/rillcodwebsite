import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { env } from '@/config/env';

export class VideoService {
    async createMeeting(courseId: string, topic: string, startTime: string, duration: number) {
        // In a real implementation:
        // 1. Authenticate with Provider (Zoom/GMeet/Teams)
        // 2. Call their API to create meeting
        // 3. Return the join URL and ID

        console.log(`Creating ${topic} meeting for course ${courseId}...`);

        // Placeholder logic
        const meetingUrl = `https://zoom.us/j/${Math.floor(Math.random() * 1000000000)}`;

        const supabase = await createClient();
        const { data: session, error } = await supabase
            .from('live_sessions')
            .insert([{
                course_id: courseId,
                title: topic,
                meeting_url: meetingUrl,
                scheduled_start: startTime,
                duration_minutes: duration,
                status: 'scheduled'
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);
        return session;
    }

    async recordAttendance(sessionId: string, userId: string) {
        const supabase = await createClient();
        await supabase.from('live_session_attendance').insert([{
            session_id: sessionId,
            portal_user_id: userId,
            joined_at: new Date().toISOString()
        }]);
    }
}

export const videoService = new VideoService();
