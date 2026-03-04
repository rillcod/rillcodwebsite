import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';

// Grades focus on calculating final values from given assignment submissions
export class GradesService {

    async listGrades(userId: string, programId?: string, tenantId?: string) {
        const supabase = await createClient();

        // Grades are stored in enrollments (portal users), keyed by user_id
        let query = supabase
            .from('enrollments')
            .select('*, programs!inner(name, school_id)')
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

        return data;
    }

    async getGrade(enrollmentId: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('enrollments')
            .select('*, programs!inner(school_id)')
            .eq('id', enrollmentId)
            .single();

        if (error || !data) {
            throw new NotFoundError('Grade record not found');
        }

        if (tenantId && (data.programs as any).school_id !== tenantId) {
            throw new NotFoundError('Grade record not found');
        }

        return data;
    }

    async updateGrade(enrollmentId: string, grade: string, notes?: string, tenantId?: string) {
        const supabase = await createClient();
        const enrollment = await this.getGrade(enrollmentId, tenantId);

        const { data, error } = await supabase
            .from('enrollments')
            .update({
                grade,
                notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', enrollmentId)
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to update grade: ${error.message}`, 400);
        }

        // Trigger notification
        (async () => {
            try {
                if (!data.user_id || !data.program_id) return;

                const { data: user } = await supabase
                    .from('portal_users')
                    .select('email, full_name')
                    .eq('id', data.user_id)
                    .single();

                const { data: program } = await supabase
                    .from('programs')
                    .select('name')
                    .eq('id', data.program_id)
                    .single();

                if (user?.email) {
                    const template = await templatesService.getTemplate('Grade Published', 'email');
                    const html = templatesService.render(template.content, {
                        user_name: user.full_name,
                        course_name: program?.name || 'your course',
                        grade: data.grade || 'N/A',
                        notes: data.notes || 'No comments'
                    });

                    await queueService.queueNotification(data.user_id, 'email', {
                        to: user.email,
                        subject: templatesService.render(template.subject || 'Grade Published', { course_name: program?.name || 'Course' }),
                        html
                    });
                }
            } catch (err) {
                console.error('Failed to trigger grade notification:', err);
            }
        })();

        return data;
    }

    // Create a grade wrapper - technically same as update for enrollments
    async createGrade(studentId: string, programId: string, grade: string, notes?: string, tenantId?: string) {
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

        return this.updateGrade(enrollment.id, grade, notes, tenantId);
    }

    async calculateGPA(userId: string) {
        const supabase = await createClient();

        // Calculate GPA by fetching all graded submissions
        const { data: submissions, error: subErr } = await supabase
            .from('assignment_submissions')
            .select('grade, assignments!inner(max_points)')
            .eq('portal_user_id', userId)
            .eq('status', 'graded')
            .not('grade', 'is', null);

        // Fetch CBT exam sessions
        const { data: exams, error: examErr } = await supabase
            .from('cbt_sessions')
            .select('score, cbt_exams!inner(passing_score)')
            .eq('user_id', userId)
            .in('status', ['passed', 'failed', 'completed'])
            .not('score', 'is', null);

        let totalWeight = 0;
        let totalScore = 0;

        if (submissions && !subErr) {
            submissions.forEach(sub => {
                const assign = sub.assignments as any;
                const maxPts = assign?.max_points || 100;
                totalScore += ((sub.grade || 0) / maxPts) * 100;
                totalWeight += 1;
            });
        }

        if (exams && !examErr) {
            exams.forEach(exam => {
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
