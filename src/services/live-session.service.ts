import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { videoConferenceService, MeetingConfig, Provider } from './video-conference.service';
import { notificationsService } from './notifications.service';

export interface ScheduleSessionParams {
    courseId: string;
    instructorId: string;
    title: string;
    description?: string;
    scheduledStart: string; // ISO String representation
    scheduledEnd: string;
    provider: Provider;
    recordingEnabled?: boolean;
    allowBreakoutRooms?: boolean;
    allowScreenSharing?: boolean;
    allowPolls?: boolean;
}

export class LiveSessionService {
    async scheduleLiveSession(params: ScheduleSessionParams) {
        const supabase = await createClient();

        // 1. Check if course exists
        const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('title, program_id')
            .eq('id', params.courseId)
            .single();

        if (courseErr || !course) {
            throw new AppError('Course not found', 404);
        }

        // 2. Create meeting via video-conference provider
        const durationMinutes = Math.floor((new Date(params.scheduledEnd).getTime() - new Date(params.scheduledStart).getTime()) / 60000);

        const meetingConfig: MeetingConfig = {
            topic: `${course.title}: ${params.title}`,
            startTime: new Date(params.scheduledStart),
            durationMinutes,
            provider: params.provider,
        };

        const meetingInfo = await videoConferenceService.createMeeting(meetingConfig);

        // 3. Save to database
        const { data: session, error: dbErr } = await supabase
            .from('live_sessions')
            .insert([{
                course_id: params.courseId,
                instructor_id: params.instructorId,
                title: params.title,
                description: params.description,
                scheduled_start: params.scheduledStart,
                scheduled_end: params.scheduledEnd,
                provider: meetingInfo.provider,
                meeting_id: meetingInfo.meeting_id,
                meeting_url: meetingInfo.meeting_url,
                meeting_password: meetingInfo.meeting_password,
                recording_enabled: params.recordingEnabled ?? false,
                allow_breakout_rooms: params.allowBreakoutRooms ?? false,
                allow_screen_sharing: params.allowScreenSharing ?? true,
                allow_polls: params.allowPolls ?? false,
                status: 'scheduled'
            }])
            .select()
            .single();

        if (dbErr) throw new AppError(dbErr.message, 500);

        // 4. Send notifications to all enrolled students
        const programId = course.program_id;
        const { data: enrollments } = await supabase
            .from('enrollments')
            .select('user_id')
            .eq('program_id', programId)
            .eq('status', 'active');

        if (enrollments) {
            for (const { user_id } of enrollments) {
                await notificationsService.logNotification(
                    user_id,
                    'New Live Session Scheduled',
                    `A new live session covering "${params.title}" has been scheduled for your course.`,
                    'info'
                );
            }
        }

        return session;
    }

    async updateSessionStatus(sessionId: string, status: 'scheduled' | 'live' | 'completed' | 'cancelled') {
        const supabase = await createClient();

        const updates: any = { status };

        if (status === 'live') {
            updates.actual_start = new Date().toISOString();
        } else if (status === 'completed') {
            updates.actual_end = new Date().toISOString();
            // Automatically fetch recording async after completion (mocked logic)
            setTimeout(() => this.syncRecording(sessionId).catch(console.error), 3600000); // Wait 1hr before looking for recording
        }

        const { data, error } = await supabase
            .from('live_sessions')
            .update(updates)
            .eq('id', sessionId)
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async updateSessionDetails(sessionId: string, updates: Partial<{
        title: string;
        description: string;
        scheduledStart: string;
        scheduledEnd: string;
        recordingEnabled: boolean;
        allowBreakoutRooms: boolean;
        allowScreenSharing: boolean;
        allowPolls: boolean;
    }>) {
        const supabase = await createClient();
        const payload: any = {};
        if (updates.title) payload.title = updates.title;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.scheduledStart) payload.scheduled_start = updates.scheduledStart;
        if (updates.scheduledEnd) payload.scheduled_end = updates.scheduledEnd;
        if (updates.recordingEnabled !== undefined) payload.recording_enabled = updates.recordingEnabled;
        if (updates.allowBreakoutRooms !== undefined) payload.allow_breakout_rooms = updates.allowBreakoutRooms;
        if (updates.allowScreenSharing !== undefined) payload.allow_screen_sharing = updates.allowScreenSharing;
        if (updates.allowPolls !== undefined) payload.allow_polls = updates.allowPolls;

        const { data, error } = await supabase
            .from('live_sessions')
            .update(payload)
            .eq('id', sessionId)
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async joinSession(sessionId: string, userId: string): Promise<string> {
        const supabase = await createClient();

        // Check if user already joined
        const { data: existing } = await supabase
            .from('live_session_attendance')
            .select('id')
            .eq('session_id', sessionId)
            .eq('portal_user_id', userId)
            .single();

        if (!existing) {
            await supabase.from('live_session_attendance').insert([{
                session_id: sessionId,
                portal_user_id: userId,
                joined_at: new Date().toISOString()
            }]);
        }

        // Return the meeting URL
        const { data: session, error } = await supabase
            .from('live_sessions')
            .select('meeting_url, status')
            .eq('id', sessionId)
            .single();

        if (error || !session) throw new AppError('Session not found', 404);

        if (session.status !== 'live' && session.status !== 'scheduled') {
            throw new AppError('This session is no longer active', 400);
        }

        return session.meeting_url;
    }

    async leaveSession(sessionId: string, userId: string) {
        const supabase = await createClient();

        // Get existing attendance
        const { data: attendance } = await supabase
            .from('live_session_attendance')
            .select('id, joined_at')
            .eq('session_id', sessionId)
            .eq('portal_user_id', userId)
            .single();

        if (attendance && attendance.joined_at) {
            const leftAt = new Date();
            const joinedAt = new Date(attendance.joined_at);
            const durationMinutes = Math.floor((leftAt.getTime() - joinedAt.getTime()) / 60000);

            await supabase.from('live_session_attendance')
                .update({
                    left_at: leftAt.toISOString(),
                    duration_minutes: durationMinutes
                })
                .eq('id', attendance.id);
        }

        return true;
    }

    async syncRecording(sessionId: string) {
        const supabase = await createClient();

        const { data: session } = await supabase
            .from('live_sessions')
            .select('meeting_id, provider')
            .eq('id', sessionId)
            .single();

        if (!session?.meeting_id || !session?.provider) return;

        const recordingUrl = await videoConferenceService.getRecordingUrl(
            session.meeting_id,
            session.provider as Provider
        );

        if (recordingUrl) {
            await supabase
                .from('live_sessions')
                .update({ recording_url: recordingUrl })
                .eq('id', sessionId);
        }
    }

    async listSessions(courseId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_sessions')
            .select('*')
            .eq('course_id', courseId)
            .order('scheduled_start', { ascending: true });
        if (error) throw new AppError(error.message, 500);
        return data ?? [];
    }

    async getSession(sessionId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async createBreakoutRoom(sessionId: string, name: string, maxParticipants?: number, createdBy?: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_session_breakout_rooms')
            .insert([{
                session_id: sessionId,
                name,
                max_participants: maxParticipants ?? null,
                created_by: createdBy ?? null,
                status: 'active'
            }])
            .select()
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async listBreakoutRooms(sessionId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_session_breakout_rooms')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        if (error) throw new AppError(error.message, 500);
        return data ?? [];
    }

    async addBreakoutParticipant(roomId: string, userId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_session_breakout_participants')
            .insert([{
                room_id: roomId,
                portal_user_id: userId,
                joined_at: new Date().toISOString()
            }])
            .select()
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async createPoll(sessionId: string, question: string, pollType: 'poll' | 'quiz', options: { text: string; isCorrect?: boolean }[], createdBy?: string, allowMultiple: boolean = false) {
        const supabase = await createClient();
        const { data: poll, error: pollErr } = await supabase
            .from('live_session_polls')
            .insert([{
                session_id: sessionId,
                question,
                poll_type: pollType,
                status: 'draft',
                allow_multiple: allowMultiple,
                created_by: createdBy ?? null
            }])
            .select()
            .single();

        if (pollErr) throw new AppError(pollErr.message, 500);

        if (options.length > 0) {
            const payload = options.map((opt, index) => ({
                poll_id: poll.id,
                option_text: opt.text,
                order_index: index + 1,
                is_correct: opt.isCorrect ?? false
            }));
            const { error: optsErr } = await supabase
                .from('live_session_poll_options')
                .insert(payload);
            if (optsErr) throw new AppError(optsErr.message, 500);
        }

        return poll;
    }

    async listPolls(sessionId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_session_polls')
            .select('*, live_session_poll_options(*)')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        if (error) throw new AppError(error.message, 500);
        return data ?? [];
    }

    async submitPollResponse(pollId: string, optionIds: string[], userId: string) {
        const supabase = await createClient();
        const payload = optionIds.map(optionId => ({
            poll_id: pollId,
            option_id: optionId,
            portal_user_id: userId
        }));
        const { error } = await supabase.from('live_session_poll_responses').insert(payload);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async sendSessionReminders() {
        const supabase = await createClient();
        const now = new Date();
        const inFifteen = new Date(now.getTime() + 15 * 60 * 1000);

        const { data: sessions, error } = await supabase
            .from('live_sessions')
            .select('id, title, scheduled_start, course_id')
            .gte('scheduled_start', now.toISOString())
            .lte('scheduled_start', inFifteen.toISOString());

        if (error) throw new AppError(error.message, 500);

        for (const session of sessions ?? []) {
            const { data: course } = await supabase
                .from('courses')
                .select('program_id')
                .eq('id', session.course_id)
                .single();

            if (!course?.program_id) continue;

            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('user_id')
                .eq('program_id', course.program_id)
                .eq('status', 'active');

            for (const enrollment of enrollments ?? []) {
                await notificationsService.logNotification(
                    enrollment.user_id,
                    'Live Session Reminder',
                    `Your live session "${session.title}" starts in 15 minutes.`,
                    'info'
                );
            }
        }

        return { processed: sessions?.length ?? 0 };
    }
}

export const liveSessionService = new LiveSessionService();
