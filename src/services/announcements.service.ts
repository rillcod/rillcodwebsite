import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';

// The announcements table schema:
// id, title, content, author_id, target_audience, is_active, created_at, updated_at
// target_audience CHECK: 'all' | 'students' | 'teachers' | 'admins'

export interface AnnouncementInput {
    title: string;
    content: string;
    target_audience?: 'all' | 'students' | 'teachers' | 'admins';
    is_active?: boolean;
}

export class AnnouncementsService {
    async listAnnouncements(tenantId?: string, audience?: string, limit: number = 20) {
        const supabase = await createClient();

        let query = supabase
            .from('announcements')
            .select('*, portal_users(full_name, role)')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (audience) {
            query = query.in('target_audience', ['all', audience]);
        }

        const { data, error } = await query;
        if (error) {
            throw new AppError(`Failed to fetch announcements: ${error.message}`, 500);
        }

        return data;
    }

    async getAnnouncement(id: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('announcements')
            .select('*, portal_users(full_name)')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundError('Announcement not found');
        }

        return data;
    }

    async createAnnouncement(input: AnnouncementInput, authorId: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('announcements')
            .insert([{
                title: input.title,
                content: input.content,
                author_id: authorId,
                target_audience: input.target_audience ?? 'all',
                is_active: input.is_active !== false,
            }])
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to create announcement: ${error.message}`, 400);
        }

        return data;
    }

    async updateAnnouncement(id: string, input: Partial<AnnouncementInput>, tenantId?: string) {
        const supabase = await createClient();
        await this.getAnnouncement(id, tenantId);

        const updatePayload: Record<string, any> = {};
        if (input.title !== undefined) updatePayload.title = input.title;
        if (input.content !== undefined) updatePayload.content = input.content;
        if (input.target_audience !== undefined) updatePayload.target_audience = input.target_audience;
        if (input.is_active !== undefined) updatePayload.is_active = input.is_active;

        const { data, error } = await supabase
            .from('announcements')
            .update(updatePayload as any)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to update announcement: ${error.message}`, 400);
        }

        return data;
    }

    async deleteAnnouncement(id: string, tenantId?: string) {
        const supabase = await createClient();
        await this.getAnnouncement(id, tenantId);

        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) {
            throw new AppError(`Failed to delete announcement: ${error.message}`, 400);
        }

        return true;
    }
}

export const announcementsService = new AnnouncementsService();
