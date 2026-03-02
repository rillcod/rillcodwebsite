import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';

export interface AssignmentInput {
    course_id: string;
    title: string;
    description?: string;
    instructions?: string;
    due_date?: string;
    max_points?: number;
    assignment_type?: 'homework' | 'project' | 'quiz' | 'exam' | 'presentation';
    is_active?: boolean;
}

export interface SubmissionInput {
    submission_text?: string;
    file_url?: string;
}

export class AssignmentsService {
    async listAssignments(courseId: string, tenantId?: string) {
        const supabase = await createClient();

        // confirm course access
        const { data: course, error: err } = await supabase.from('courses').select('school_id').eq('id', courseId).single();
        if (err || !course || (tenantId && course.school_id !== tenantId)) {
            throw new NotFoundError('Course not found or access denied');
        }

        const { data, error } = await supabase
            .from('assignments')
            .select('*')
            .eq('course_id', courseId)
            .order('due_date', { ascending: true });

        if (error) {
            throw new AppError(`Failed to fetch assignments: ${error.message}`, 500);
        }

        return data;
    }

    async getAssignment(id: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('assignments')
            .select('*, courses!inner(school_id)')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundError('Assignment not found');
        }

        if (tenantId && data.courses.school_id !== tenantId) {
            throw new NotFoundError('Assignment not found');
        }

        return data;
    }

    async createAssignment(input: AssignmentInput, createdBy: string, tenantId?: string) {
        const supabase = await createClient();

        const { data: course, error: err } = await supabase.from('courses').select('school_id').eq('id', input.course_id).single();
        if (err || !course || (tenantId && course.school_id !== tenantId)) {
            throw new AppError('Course not found or access denied', 403);
        }

        const { data, error } = await supabase
            .from('assignments')
            .insert([
                {
                    ...input,
                    created_by: createdBy,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to create assignment: ${error.message}`, 400);
        }

        return data;
    }

    async updateAssignment(id: string, input: Partial<AssignmentInput>, tenantId?: string) {
        const supabase = await createClient();
        await this.getAssignment(id, tenantId);

        const { data, error } = await supabase
            .from('assignments')
            .update({
                ...input,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to update assignment: ${error.message}`, 400);
        }

        return data;
    }

    async deleteAssignment(id: string, tenantId?: string) {
        const supabase = await createClient();
        await this.getAssignment(id, tenantId);

        const { error } = await supabase
            .from('assignments')
            .delete()
            .eq('id', id);

        if (error) {
            throw new AppError(`Failed to delete assignment: ${error.message}`, 400);
        }

        return true;
    }

    async submitAssignment(id: string, userId: string, input: SubmissionInput, tenantId?: string) {
        const supabase = await createClient();
        const assignment = await this.getAssignment(id, tenantId);

        // Check if past due date
        const isLate = assignment.due_date && new Date() > new Date(assignment.due_date);
        const status = isLate ? 'late' : 'submitted';

        const { data: existing } = await supabase
            .from('assignment_submissions')
            .select('id, status')
            .eq('assignment_id', id)
            .eq('portal_user_id', userId)
            .maybeSingle();

        let result;
        let errorResponse;

        if (existing) {
            const { data, error } = await supabase
                .from('assignment_submissions')
                .update({
                    ...input,
                    status: existing.status === 'graded' ? 'graded' : status, // keep graded if resubmitted (or depending on logic)
                    submitted_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();
            result = data;
            errorResponse = error;
        } else {
            const { data, error } = await supabase
                .from('assignment_submissions')
                .insert([{
                    assignment_id: id,
                    portal_user_id: userId,
                    ...input,
                    status,
                    submitted_at: new Date().toISOString()
                }])
                .select()
                .single();
            result = data;
            errorResponse = error;
        }

        if (errorResponse) {
            throw new AppError(`Failed to submit assignment: ${errorResponse.message}`, 500);
        }

        const { gamificationService } = await import('./gamification.service');
        const { badgeService } = await import('./badge.service');

        const result_gamify = await gamificationService.awardPoints(userId, 'assignment_submit', id, 'Submitted an assignment');
        await badgeService.awardBadgeIfEligible(userId, 'points_milestone', { totalPoints: result_gamify.totalPoints });

        return result;
    }

    async gradeAssignment(assignmentId: string, submissionId: string, graderId: string, grade: number, feedback?: string, tenantId?: string) {
        const supabase = await createClient();
        // verify access
        await this.getAssignment(assignmentId, tenantId);

        const { data, error } = await supabase
            .from('assignment_submissions')
            .update({
                grade,
                feedback,
                status: 'graded',
                graded_by: graderId,
                graded_at: new Date().toISOString()
            })
            .eq('id', submissionId)
            .eq('assignment_id', assignmentId)
            .select()
            .single();

        if (error || !data) {
            throw new AppError('Failed to grade assignment submission', 400);
        }

        // TODO: Send notification to the user about grade publish
        // Example via hypothetical notifications service
        // await notificationsService.send(data.user_id, 'grade_published', { assignmentId, grade });

        return data;
    }
}

export const assignmentsService = new AssignmentsService();
