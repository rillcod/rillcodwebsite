import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';
import { sendPushNotification, buildNotificationUrl } from '@/lib/push';
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

        if (status === 'completed' && data) {
            await this.logCompletionInteractions(data);
        }

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

        if (updates.status === 'completed' && data) {
            await this.logCompletionInteractions(data);
        }

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
            .select('id, title, scheduled_at, program_id, school_id')
            .gte('scheduled_at', now.toISOString())
            .lte('scheduled_at', inFifteen.toISOString())
            .eq('status', 'scheduled');

        if (error) throw new AppError(error.message, 500);

        for (const session of sessions ?? []) {
            let recipientIds: string[] = [];

            if (session.program_id) {
                const { data: enrollments } = await supabase
                    .from('enrollments')
                    .select('user_id')
                    .eq('program_id', session.program_id)
                    .eq('status', 'active');
                recipientIds = (enrollments ?? []).map(e => e.user_id).filter((id): id is string => !!id);
            } else if (session.school_id) {
                const { data: schoolUsers } = await supabase
                    .from('portal_users')
                    .select('id')
                    .eq('school_id', session.school_id)
                    .eq('role', 'student')
                    .eq('is_active', true);
                recipientIds = (schoolUsers ?? []).map(u => u.id);
            }

            if (recipientIds.length === 0) continue;

            for (const userId of recipientIds) {
                // 1. In-app notification
                await notificationsService.logNotification(
                    userId,
                    'Live Session Reminder',
                    `Your live session "${session.title}" starts in 15 minutes.`,
                    'info'
                );

                // 2. Push Notification
                await sendPushNotification(
                    userId,
                    {
                        title: 'Live Session Reminder',
                        body: `Your live session "${session.title}" starts in 15 minutes.`,
                        url: buildNotificationUrl('live_session', session.id),
                    }
                );
            }
        }

        return { processed: sessions?.length ?? 0 };
    }

    private async logCompletionInteractions(session: Database['public']['Tables']['live_sessions']['Row']) {
        const supabase = await createClient();

        // 1. Fetch all attendees for this session
        const { data: attendees, error: attErr } = await supabase
            .from('live_session_attendance')
            .select(`
                portal_user_id,
                portal_users (
                    full_name,
                    school_id
                )
            `)
            .eq('session_id', session.id)
            .not('portal_user_id', 'is', null);

        if (attErr || !attendees || attendees.length === 0) return;

        // 2. Fetch host name for the log
        const { data: host } = await supabase
            .from('portal_users')
            .select('full_name')
            .eq('id', session.host_id)
            .single();

        const hostName = host?.full_name || 'Instructor';

        // 3. Log for each student (contact)
        const studentInteractions: any[] = attendees.map(att => {
            const user = (Array.isArray(att.portal_users) ? att.portal_users[0] : att.portal_users) as any;
            return {
                contact_id: att.portal_user_id,
                contact_type: 'portal_user',
                contact_name: user?.full_name || 'Unknown Student',
                type: 'meeting',
                direction: 'inbound',
                content: `Attended live session: "${session.title}" (Duration: ${session.duration_minutes} min)`,
                staff_id: session.host_id,
                staff_name: hostName,
                created_at: new Date().toISOString()
            };
        });

        if (studentInteractions.length > 0) {
            await supabase.from('crm_interactions').insert(studentInteractions);
        }

        // 4. Log for each unique school involved
        const schoolsToLog = new Map<string, number>();
        attendees.forEach(att => {
            const user = (Array.isArray(att.portal_users) ? att.portal_users[0] : att.portal_users) as any;
            if (user?.school_id) {
                schoolsToLog.set(user.school_id, (schoolsToLog.get(user.school_id) || 0) + 1);
            }
        });

        if (schoolsToLog.size > 0) {
            const { data: schools } = await supabase
                .from('schools')
                .select('id, name')
                .in('id', Array.from(schoolsToLog.keys()));

            if (schools) {
                const schoolInteractions = schools.map(school => ({
                    contact_id: school.id,
                    contact_type: 'school',
                    contact_name: school.name,
                    type: 'meeting',
                    direction: 'inbound',
                    content: `Live session completed: "${session.title}". ${schoolsToLog.get(school.id)} student(s) from this school attended. Host: ${hostName}.`,
                    staff_id: session.host_id,
                    staff_name: hostName,
                    created_at: new Date().toISOString()
                }));
                await supabase.from('crm_interactions').insert(schoolInteractions);
            }
        }
    }

    // Breakout room methods (still supported by DB)
    async getSessionAttendance(sessionId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('live_session_attendance')
            .select(`
                id,
                portal_user_id,
                joined_at,
                left_at,
                duration_minutes,
                portal_users (full_name, role)
            `)
            .eq('session_id', sessionId)
            .order('joined_at', { ascending: true });
        if (error) throw new AppError(error.message, 500);
        return data ?? [];
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
            .select('*, live_session_breakout_participants(id)')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        if (error) throw new AppError(error.message, 500);

        return (data ?? []).map(room => ({
            ...room,
            participant_count: Array.isArray(room.live_session_breakout_participants)
                ? room.live_session_breakout_participants.length
                : 0,
        }));
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

        // Fetch polls with options
        const { data, error } = await supabase
            .from('live_session_polls')
            .select('*, live_session_poll_options(*)')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        if (error) throw new AppError(error.message, 500);
        if (!data || data.length === 0) return [];

        // Fetch response counts per option for all polls in one query
        const pollIds = data.map(p => p.id);
        const { data: responses } = await supabase
            .from('live_session_poll_responses')
            .select('poll_id, option_id')
            .in('poll_id', pollIds);

        // Build a count map: option_id → count
        const countMap: Record<string, number> = {};
        for (const r of responses ?? []) {
            countMap[r.option_id] = (countMap[r.option_id] ?? 0) + 1;
        }

        // Attach response_count to each option
        return data.map(poll => ({
            ...poll,
            options: (poll.live_session_poll_options ?? []).map((opt: any) => ({
                ...opt,
                response_count: countMap[opt.id] ?? 0,
            })),
        }));
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
