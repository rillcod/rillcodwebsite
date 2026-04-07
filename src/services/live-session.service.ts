import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';
import type { Database } from '@/types/supabase';

export interface ScheduleSessionParams {
    hostId: string;
    title: string;
    description?: string;
    scheduledAt: string; // ISO string
    durationMinutes?: number;
    platform?: 'zoom' | 'google_meet' | 'teams' | 'discord' | 'other';
    sessionUrl?: string;
    programId?: string;
    schoolId?: string;
    notes?: string;
}

type LiveSessionUpdate = Database['public']['Tables']['live_sessions']['Update'];
type LiveSessionPollOptionInsert = Database['public']['Tables']['live_session_poll_options']['Insert'];
type LiveSessionPollResponseInsert = Database['public']['Tables']['live_session_poll_responses']['Insert'];

export class LiveSessionService {
    async scheduleLiveSession(params: ScheduleSessionParams) {
        const supabase = await createClient();

        const { data: session, error: dbErr } = await supabase
            .from('live_sessions')
            .insert([{
                host_id: params.hostId,
                title: params.title,
                description: params.description ?? null,
                scheduled_at: params.scheduledAt,
                duration_minutes: params.durationMinutes ?? 60,
                platform: params.platform ?? 'zoom',
                session_url: params.sessionUrl ?? null,
                program_id: params.programId ?? null,
                school_id: params.schoolId ?? null,
                notes: params.notes ?? null,
                status: 'scheduled',
            }])
            .select()
            .single();

        if (dbErr) throw new AppError(dbErr.message, 500);

        // Send notifications to enrolled students if program_id provided
        if (params.programId) {
            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('user_id')
                .eq('program_id', params.programId)
                .eq('status', 'active');

            for (const { user_id } of enrollments ?? []) {
                if (!user_id) continue;
                await notificationsService.logNotification(
                    user_id,
                    'New Live Session Scheduled',
                    `A new live session "${params.title}" has been scheduled.`,
                    'info'
                );
            }
        }

        return session;
    }

    async updateSessionStatus(sessionId: string, status: 'scheduled' | 'live' | 'completed' | 'cancelled') {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('live_sessions')
            .update({ status })
            .eq('id', sessionId)
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async updateSessionDetails(sessionId: string, updates: Partial<{
        title: string;
        description: string;
        scheduledAt: string;
        durationMinutes: number;
        platform: 'zoom' | 'google_meet' | 'teams' | 'discord' | 'other';
        sessionUrl: string;
        programId: string;
        schoolId: string;
        recordingUrl: string;
        notes: string;
        status: 'scheduled' | 'live' | 'completed' | 'cancelled';
    }>) {
        const supabase = await createClient();
        const payload: LiveSessionUpdate = {};
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.scheduledAt !== undefined) payload.scheduled_at = updates.scheduledAt;
        if (updates.durationMinutes !== undefined) payload.duration_minutes = updates.durationMinutes;
        if (updates.platform !== undefined) payload.platform = updates.platform;
        if (updates.sessionUrl !== undefined) payload.session_url = updates.sessionUrl;
        if (updates.programId !== undefined) payload.program_id = updates.programId;
        if (updates.schoolId !== undefined) payload.school_id = updates.schoolId;
        if (updates.recordingUrl !== undefined) payload.recording_url = updates.recordingUrl;
        if (updates.notes !== undefined) payload.notes = updates.notes;
        if (updates.status !== undefined) payload.status = updates.status;

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

        // Record attendance (upsert-style)
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
                joined_at: new Date().toISOString(),
            }]);
        }

        // Return the session URL
        const { data: session, error } = await supabase
            .from('live_sessions')
            .select('session_url, status')
            .eq('id', sessionId)
            .single();

        if (error || !session) throw new AppError('Session not found', 404);

        if (session.status !== 'live' && session.status !== 'scheduled') {
            throw new AppError('This session is no longer active', 400);
        }

        return session.session_url ?? '';
    }

    async leaveSession(sessionId: string, userId: string) {
        const supabase = await createClient();

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

            await supabase
                .from('live_session_attendance')
                .update({ left_at: leftAt.toISOString(), duration_minutes: durationMinutes })
                .eq('id', attendance.id);
        }

        return true;
    }

    async listSessions(filters?: { programId?: string; hostId?: string; schoolId?: string }) {
        const supabase = await createClient();
        let query = supabase
            .from('live_sessions')
            .select('*')
            .order('scheduled_at', { ascending: true });

        if (filters?.programId) query = query.eq('program_id', filters.programId);
        if (filters?.hostId) query = query.eq('host_id', filters.hostId);
        if (filters?.schoolId) query = query.eq('school_id', filters.schoolId);

        const { data, error } = await query;
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

    async sendSessionReminders() {
        const supabase = await createClient();
        const now = new Date();
        const inFifteen = new Date(now.getTime() + 15 * 60 * 1000);

        const { data: sessions, error } = await supabase
            .from('live_sessions')
            .select('id, title, scheduled_at, program_id')
            .gte('scheduled_at', now.toISOString())
            .lte('scheduled_at', inFifteen.toISOString())
            .eq('status', 'scheduled');

        if (error) throw new AppError(error.message, 500);

        for (const session of sessions ?? []) {
            if (!session.program_id) continue;

            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('user_id')
                .eq('program_id', session.program_id)
                .eq('status', 'active');

            for (const enrollment of enrollments ?? []) {
                if (!enrollment.user_id) continue;
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

    // Breakout room methods (still supported by DB)
    async createBreakoutRoom(sessionId: string, name: string, maxParticipants?: number, createdBy?: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_session_breakout_rooms')
            .insert([{
                session_id: sessionId,
                name,
                max_participants: maxParticipants ?? null,
                created_by: createdBy ?? null,
                status: 'active',
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
                joined_at: new Date().toISOString(),
            }])
            .select()
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async createPoll(
        sessionId: string,
        question: string,
        pollType: 'poll' | 'quiz',
        options: { text: string; isCorrect?: boolean }[],
        createdBy?: string,
        allowMultiple: boolean = false,
    ) {
        const supabase = await createClient();
        const { data: poll, error: pollErr } = await supabase
            .from('live_session_polls')
            .insert([{
                session_id: sessionId,
                question,
                poll_type: pollType,
                status: 'draft',
                allow_multiple: allowMultiple,
                created_by: createdBy ?? null,
            }])
            .select()
            .single();

        if (pollErr) throw new AppError(pollErr.message, 500);

        if (options.length > 0) {
            const payload: LiveSessionPollOptionInsert[] = options.map((opt, index) => ({
                poll_id: poll.id,
                option_text: opt.text,
                order_index: index + 1,
                is_correct: opt.isCorrect ?? false,
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
        const payload: LiveSessionPollResponseInsert[] = optionIds.map(optionId => ({
            poll_id: pollId,
            option_id: optionId,
            portal_user_id: userId,
        }));
        const { error } = await supabase.from('live_session_poll_responses').insert(payload);
        if (error) throw new AppError(error.message, 500);
        return true;
    }
}

export const liveSessionService = new LiveSessionService();
