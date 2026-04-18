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
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundError('Assignment not found');
        }

        if (tenantId && data.course_id) {
            const { data: courseData, error: courseErr } = await supabase
                .from('courses')
                .select('school_id')
                .eq('id', data.course_id)
                .single();

            if (courseErr || !courseData || courseData.school_id !== tenantId) {
                throw new NotFoundError('Assignment not found');
            }
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
        const { engagementService } = await import('./engagement.service');

        // Legacy points (keeping for compatibility)
        const result_gamify = await gamificationService.awardPoints(userId, 'assignment_submit', id, 'Submitted an assignment');
        await badgeService.awardBadgeIfEligible(userId, 'points_milestone', { totalPoints: result_gamify.totalPoints });

        // New Engagement tracking
        try {
            // 1. Award XP
            await engagementService.awardXP(userId, 'assignment_submitted', {
                refId: id,
                refType: 'assignment',
                schoolId: assignment.school_id ?? undefined
            });

            // 2. Update Streak
            await engagementService.updateWeeklyStreak(userId);

            // 3. Check for specific badges
            const { count: submissionCount } = await supabase
                .from('assignment_submissions')
                .select('*', { count: 'exact', head: true })
                .eq('portal_user_id', userId);

            if (submissionCount === 1) {
                await engagementService.awardBadge(userId, 'first_assignment', { refId: id });
            } else if (submissionCount === 10) {
                await engagementService.awardBadge(userId, 'consistent_10');
            }
        } catch (engErr) {
            console.error('Engagement tracking failed:', engErr);
            // Don't fail the submission if engagement tracking errors
        }

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

        // Send notification to the user about grade publish
        try {
            if (!data.portal_user_id) {
                console.warn('No portal_user_id found for submission');
                return data;
            }

            const { data: user } = await supabase.from('portal_users').select('id, email, full_name').eq('id', data.portal_user_id).single();
            const { data: assignment } = await supabase.from('assignments').select('title').eq('id', assignmentId).single();
            
            if (user && assignment) {
                const { notificationsService } = await import('./notifications.service');
                const title = 'Assignment Graded';
                const message = `Your submission for "${assignment.title}" has been graded. Score: ${grade}`;
                
                await notificationsService.logNotification(user.id, title, message, 'success');
                
                if (user.email) {
                    await notificationsService.sendEmail(user.id, {
                        to: user.email,
                        subject: `Graded: ${assignment.title}`,
                        html: `
                            <h2>Assignment Graded</h2>
                            <p>Hello ${user.full_name},</p>
                            <p>Your submission for <strong>${assignment.title}</strong> has been graded.</p>
                            <p><strong>Grade:</strong> ${grade}</p>
                            ${feedback ? `<p><strong>Feedback:</strong> ${feedback}</p>` : ''}
                            <p>Login to your dashboard to view more details.</p>
                        `
                    });
                }
            }
        } catch (notifErr) {
            console.error('Failed to send grade notification:', notifErr);
            // Don't fail the whole grading process if notification fails
        }

        return data;
    }
}

export const assignmentsService = new AssignmentsService();
