import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import type { Database } from '@/types/supabase';

// The announcements table schema:
// id, title, content, author_id, target_audience, is_active, created_at, updated_at
// target_audience CHECK: 'all' | 'students' | 'teachers' | 'admins'

export interface AnnouncementInput {
    title: string;
    content: string;
    target_audience?: 'all' | 'students' | 'teachers' | 'admins' | 'parents' | 'class';
    status?: 'draft' | 'published' | 'archived';
    expires_at?: string | null;
    class_id?: string | null;
    school_id?: string | null;
    is_active?: boolean;
}

type AnnouncementUpdate = Database['public']['Tables']['announcements']['Update'];

export class AnnouncementsService {
    async listAnnouncements(params: {
        tenantId?: string;
        audience?: string;
        classId?: string;
        allStatus?: boolean;
        limit?: number;
    } = {}) {
        const { tenantId, audience, classId, allStatus = false, limit = 20 } = params;
        const supabase = await createClient();

        let query = supabase
            .from('announcements')
            .select('*, portal_users!announcements_author_id_fkey(full_name, role)')
            .order('created_at', { ascending: false })
            .limit(limit);

        // 1. Filter by Status (unless staff/admin requests all)
        if (!allStatus) {
            query = query.eq('status', 'published');
            // Filter out expired ones
            const now = new Date().toISOString();
            query = query.or(`expires_at.is.null,expires_at.gt.${now}`);
        }

        // 2. Filter by Audience
        if (audience) {
            const audiences = ['all', audience];
            if (audience === 'students' || audience === 'parents') audiences.push('class');
            query = query.in('target_audience', audiences);
        }

        // 3. Filter by Targeting (Class/School)
        if (classId) {
            query = query.or(`class_id.is.null,class_id.eq.${classId}`);
        }
        if (tenantId) {
            query = query.or(`school_id.is.null,school_id.eq.${tenantId}`);
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
            .select('*, portal_users!announcements_author_id_fkey(full_name)')
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
                status: input.status ?? 'published',
                expires_at: input.expires_at ?? null,
                class_id: input.class_id ?? null,
                school_id: input.school_id ?? tenantId ?? null,
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

        const updatePayload: AnnouncementUpdate = {};
        if (input.title !== undefined) updatePayload.title = input.title;
        if (input.content !== undefined) updatePayload.content = input.content;
        if (input.target_audience !== undefined) updatePayload.target_audience = input.target_audience;
        if (input.status !== undefined) updatePayload.status = input.status;
        if (input.expires_at !== undefined) updatePayload.expires_at = input.expires_at;
        if (input.class_id !== undefined) updatePayload.class_id = input.class_id;
        if (input.is_active !== undefined) updatePayload.is_active = input.is_active;

        const { data, error } = await supabase
            .from('announcements')
            .update(updatePayload)
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
