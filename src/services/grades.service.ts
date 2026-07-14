import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';

// Grades focus on calculating final values from given assignment submissions
export class GradesService {

    async listGrades(userId: string, programId?: string, tenantId?: string, opts: { termId?: string | null } = {}) {
        const supabase = await createClient();
        const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
        const termId = opts.termId || await resolveAssignmentTermId(supabase as any, {});

        // Session grades live in enrollment_term_grades; enrollments.grade mirrors live session.
        let query = supabase
            .from('enrollments')
            .select('*, programs!inner(name, school_id), enrollment_term_grades(id, term_id, grade, notes)')
            .eq('user_id', userId);

        if (programId) {
            query = query.eq('program_id', programId);
        }

        if (tenantId) {
            query = query.eq('programs.school_id', tenantId);
        }

        const { data, error } = await query;
        if (error) {
            throw new AppError(`Failed to fetch grades: ${error.message}`, 500);
        }

        return (data ?? []).map((row: any) => {
            const sessionGrade = (row.enrollment_term_grades ?? []).find(
                (g: any) => !termId || g.term_id === termId,
            );
            return {
                ...row,
                grade: sessionGrade?.grade ?? (termId ? null : row.grade),
                notes: sessionGrade?.notes ?? row.notes,
                term_id: sessionGrade?.term_id ?? termId,
                enrollment_term_grades: undefined,
            };
        });
    }

    async getGrade(enrollmentId: string, tenantId?: string, opts: { termId?: string | null } = {}) {
        const supabase = await createClient();
        const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
        const termId = opts.termId || await resolveAssignmentTermId(supabase as any, {});

        const { data, error } = await supabase
            .from('enrollments')
            .select('*, programs!inner(school_id), enrollment_term_grades(id, term_id, grade, notes)')
            .eq('id', enrollmentId)
            .single();

        if (error || !data) {
            throw new NotFoundError('Grade record not found');
        }

        if (tenantId && (data.programs as any).school_id !== tenantId) {
            throw new NotFoundError('Grade record not found');
        }

        const sessionGrade = ((data as any).enrollment_term_grades ?? []).find(
            (g: any) => !termId || g.term_id === termId,
        );
        return {
            ...data,
            grade: sessionGrade?.grade ?? (termId ? null : (data as any).grade),
            notes: sessionGrade?.notes ?? (data as any).notes,
            term_id: sessionGrade?.term_id ?? termId,
            enrollment_term_grades: undefined,
        };
    }

    async updateGrade(
        enrollmentId: string,
        grade: string,
        notes?: string,
        tenantId?: string,
        opts: { termId?: string | null } = {},
    ) {
        const supabase = await createClient();
        const enrollment = await this.getGrade(enrollmentId, tenantId, opts);
        const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
        const termId = opts.termId || (enrollment as any).term_id || await resolveAssignmentTermId(supabase as any, {});

        const { data: sessionRow, error: upsertErr } = await supabase.rpc('upsert_enrollment_term_grade', {
            p_enrollment_id: enrollmentId,
            p_grade: grade,
            p_notes: notes ?? null,
            p_term_id: termId,
        });

        if (upsertErr) {
            throw new AppError(`Failed to update grade: ${upsertErr.message}`, 400);
        }

        const { data, error } = await supabase
            .from('enrollments')
            .select('*, programs!inner(school_id)')
            .eq('id', enrollmentId)
            .single();

        if (error || !data) {
            throw new AppError(`Failed to reload enrollment after grade update: ${error?.message ?? 'missing'}`, 400);
        }

        const merged = {
            ...data,
            grade: (sessionRow as any)?.grade ?? grade,
            notes: (sessionRow as any)?.notes ?? notes ?? (data as any).notes,
            term_id: (sessionRow as any)?.term_id ?? termId,
        };

        // Trigger notification
        (async () => {
            try {
                if (!merged.user_id || !merged.program_id) return;

                const { data: user } = await supabase
                    .from('portal_users')
                    .select('email, full_name')
                    .eq('id', merged.user_id)
                    .single();

                const { data: program } = await supabase
                    .from('programs')
                    .select('name')
                    .eq('id', merged.program_id)
                    .single();

                if (user?.email) {
                    const template = await templatesService.getTemplate('Grade Published', 'email');
                    const html = templatesService.render(template.content, {
                        user_name: user.full_name,
                        course_name: program?.name || 'your course',
                        grade: merged.grade || 'N/A',
                        notes: merged.notes || 'No comments'
                    });

                    await queueService.queueNotification(merged.user_id, 'email', {
                        to: user.email,
                        subject: templatesService.render(template.subject || 'Grade Published', { course_name: program?.name || 'Course' }),
                        html
                    });
                }
            } catch (err) {
                console.error('Failed to trigger grade notification:', err);
            }
        })();

        return merged;
    }

    // Create a grade wrapper - technically same as update for enrollments
    async createGrade(
        studentId: string,
        programId: string,
        grade: string,
        notes?: string,
        tenantId?: string,
        opts: { termId?: string | null } = {},
    ) {
        const supabase = await createClient();

        // First ensure they have an enrollment record
        const { data: enrollment, error: enrollmentError } = await supabase
            .from('enrollments')
            .select('id, programs!inner(school_id)')
            .eq('user_id', studentId)
            .eq('program_id', programId)
            .single();

        if (enrollmentError || !enrollment) {
            throw new NotFoundError('Student is not enrolled in this program');
        }

        const prog = enrollment.programs as any;
        if (tenantId && prog.school_id !== tenantId) {
            throw new AppError('Program access denied', 403);
        }

        return this.updateGrade(enrollment.id, grade, notes, tenantId, opts);
    }

    async calculateGPA(userId: string, opts: { termId?: string | null } = {}) {
        const supabase = await createClient();
        const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
        const termId = opts.termId || await resolveAssignmentTermId(supabase as any, {});

        // Calculate GPA from graded submissions in the active academic session only.
        let subQuery = supabase
            .from('assignment_submissions')
            .select('grade, assignments!inner(max_points, term_id)')
            .eq('portal_user_id', userId)
            .eq('status', 'graded')
            .not('grade', 'is', null);
        if (termId) {
            subQuery = subQuery.eq('assignments.term_id', termId) as any;
        }

        const { data: submissions, error: subErr } = await subQuery;

        // CBT has no term_id column — scope by metadata.term_id or term date window.
        const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
        const termBounds = await loadAcademicTermBounds(supabase as any, termId);
        const { data: exams, error: examErr } = await supabase
            .from('cbt_sessions')
            .select('score, end_time, cbt_exams!inner(passing_score, metadata, term_id)')
            .eq('user_id', userId)
            .in('status', ['passed', 'failed', 'completed'])
            .not('score', 'is', null);

        let totalWeight = 0;
        let totalScore = 0;

        if (submissions && !subErr) {
            for (const s of submissions as any[]) {
                const max = Number(s.assignments?.max_points) || 100;
                const grade = Number(s.grade) || 0;
                totalScore += (grade / max) * 100;
                totalWeight += 1;
            }
        }

        if (exams && !examErr) {
            const scopedExams = filterCbtByAcademicTerm(exams as any[], termId, termBounds, {
                includeUntagged: false,
            });
            scopedExams.forEach((exam) => {
                // cbt_sessions score is already a percentage
                totalScore += (exam.score || 0);
                totalWeight += 2; // exams weighted more
            });
        }

        if (totalWeight === 0) return { gpa: 0, averageScore: 0 };

        const averageScore = totalScore / totalWeight;

        // Convert 100 scale to 4.0 scale
        let gpa = 0.0;
        if (averageScore >= 90) gpa = 4.0;
        else if (averageScore >= 80) gpa = 3.0 + ((averageScore - 80) / 10);
        else if (averageScore >= 70) gpa = 2.0 + ((averageScore - 70) / 10);
        else if (averageScore >= 60) gpa = 1.0 + ((averageScore - 60) / 10);

        return {
            gpa: Math.round(gpa * 100) / 100,
            averageScore: Math.round(averageScore * 100) / 100
        };
    }
}

export const gradesService = new GradesService();
