import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { measuredAttendancePercentage } from '@/lib/attendance/policy';

export interface AttendanceInput {
    session_id: string;
    user_id: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    notes?: string;
}

export class AttendanceService {
    async listAttendance(sessionId: string, tenantId?: string) {
        const supabase = await createClient();

        // verify session and tenant
        const { data: session, error: err } = await supabase
            .from('class_sessions')
            .select('term_id, classes!class_sessions_class_id_fkey!inner(school_id)')
            .eq('id', sessionId)
            .single();

        if (err || !session) {
            throw new NotFoundError('Session not found or access denied');
        }

        const sessionClasses = session.classes as any;
        if (tenantId && sessionClasses.school_id !== tenantId) {
            throw new NotFoundError('Session not found or access denied');
        }

        const { data, error } = await supabase
            .from('attendance')
            .select('*, portal_users!attendance_user_id_fkey(full_name, email)')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new AppError(`Failed to fetch attendance: ${error.message}`, 500);
        }

        return data;
    }

    async getAttendance(id: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('attendance')
            .select('*, class_sessions!inner(classes!inner(school_id))')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundError('Attendance record not found');
        }

        const classSessions = data.class_sessions as any;
        if (tenantId && classSessions.classes.school_id !== tenantId) {
            throw new NotFoundError('Attendance record not found');
        }

        return data;
    }

    async createAttendance(input: AttendanceInput, tenantId: string) {
        const supabase = await createClient();

        // verify session
        const { data: session, error: err } = await supabase
            .from('class_sessions')
            .select('classes!inner(school_id)')
            .eq('id', input.session_id)
            .single();

        if (err || !session) {
            throw new AppError('Session not found or access denied', 403);
        }

        const sessionClasses = session.classes as any;

        if (tenantId && sessionClasses.school_id !== tenantId) {
            throw new AppError('Session not found or access denied', 403);
        }

        const { data, error } = await supabase
            .from('attendance')
            .insert([{
                ...input,
                term_id: (session as any).term_id ?? null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to create attendance: ${error.message}`, 400);
        }

        return data;
    }

    async updateAttendance(id: string, input: Partial<AttendanceInput>, tenantId?: string) {
        const supabase = await createClient();
        await this.getAttendance(id, tenantId);

        const { data, error } = await supabase
            .from('attendance')
            .update({
                ...input,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to update attendance: ${error.message}`, 400);
        }

        return data;
    }

    async markStatus(id: string, status: 'present' | 'absent', tenantId?: string) {
        return this.updateAttendance(id, { status }, tenantId);
    }

    async getStudentPercentage(userId: string, classId: string, tenantId?: string, termId?: string | null) {
        const supabase = await createClient();

        // Verify class
        const { data: cls, error: clsErr } = await supabase
            .from('classes')
            .select('school_id, term_id')
            .eq('id', classId)
            .single();

        if (clsErr || !cls || (tenantId && cls.school_id !== tenantId)) {
            throw new AppError('Class not found', 404);
        }

        let sessionQuery = supabase
            .from('class_sessions')
            .select('id')
            .eq('class_id', classId);
        const effectiveTermId = termId ?? (cls as any).term_id ?? null;
        if (effectiveTermId) sessionQuery = sessionQuery.eq('term_id', effectiveTermId);

        const { data: sessions, error } = await sessionQuery;

        if (error || !sessions || sessions.length === 0) {
            return 0; // No sessions yet
        }

        const sessionIds = sessions.map(s => s.id);

        let attendanceQuery = supabase
            .from('attendance')
            .select('status')
            .eq('user_id', userId)
            .in('session_id', sessionIds);
        if (effectiveTermId) attendanceQuery = attendanceQuery.eq('term_id', effectiveTermId);

        const { data: attendances, error: attErr } = await attendanceQuery;

        if (attErr || !attendances) {
            return 0;
        }

        const measuredAttendance = measuredAttendancePercentage(
            attendances.map(a => a.status),
            sessionIds.length,
        );
        return measuredAttendance == null ? 0 : Math.round(measuredAttendance);
    }
}

export const attendanceService = new AttendanceService();
