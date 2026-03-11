import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';

export type ContentType = 'video' | 'document' | 'quiz' | 'presentation' | 'interactive';

export interface CreateContentPayload {
    title: string;
    description?: string;
    contentType: ContentType;
    fileId?: string | null;
    category?: string | null;
    tags?: string[];
    subject?: string | null;
    gradeLevel?: string | null;
    licenseType?: string | null;
    attribution?: string | null;
}

export interface UpdateContentPayload extends Partial<CreateContentPayload> {
    isActive?: boolean;
    isApproved?: boolean;
}

export interface ListFilters {
    type?: ContentType | null;
    tag?: string | null;
    subject?: string | null;
    gradeLevel?: string | null;
    query?: string | null;
    sort?: 'created_at' | 'rating_average' | 'usage_count';
    order?: 'asc' | 'desc';
}

export class LibraryService {
    async createContent(tenantId: string | null | undefined, authorId: string, role: string, data: CreateContentPayload) {
        const supabase = await createClient();
        const { data: item, error } = await supabase
            .from('content_library')
            .insert([{
                school_id: tenantId ?? null,
                created_by: authorId,
                title: data.title,
                description: data.description ?? null,
                content_type: data.contentType,
                file_id: data.fileId ?? null,
                category: data.category ?? null,
                tags: data.tags ?? [],
                subject: data.subject ?? null,
                grade_level: data.gradeLevel ?? null,
                license_type: data.licenseType ?? null,
                attribution: data.attribution ?? null,
                is_approved: role === 'admin',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);
        return item;
    }

    async listContent(tenantId: string | undefined, filters: ListFilters = {}) {
        const supabase = await createClient();
        let query = supabase
            .from('content_library')
            .select('*, files(public_url, file_type, thumbnail_url, file_size, mime_type)');

        // If tenantId is provided, scope to that school + global content; otherwise return all
        if (tenantId) {
            query = query.or(`school_id.eq.${tenantId},school_id.is.null`);
        }

        if (filters.type) query = query.eq('content_type', filters.type);
        if (filters.tag) query = query.contains('tags', [filters.tag]);
        if (filters.subject) query = query.eq('subject', filters.subject);
        if (filters.gradeLevel) query = query.eq('grade_level', filters.gradeLevel);
        if (filters.query) {
            const q = `%${filters.query}%`;
            query = query.or(`title.ilike.${q},description.ilike.${q}`);
        }

        // Only return active, approved content
        query = query.eq('is_active', true).eq('is_approved', true);

        const sortColumn = filters.sort ?? 'created_at';
        const ascending = (filters.order ?? 'desc') === 'asc';

        const { data, error } = await query.order(sortColumn, { ascending }).limit(200);
        if (error) throw new AppError(error.message, 500);
        return data ?? [];
    }

    async getContent(tenantId: string, contentId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('content_library')
            .select('*, files(public_url, file_type, thumbnail_url, file_size, mime_type)')
            .eq('school_id', tenantId)
            .eq('id', contentId)
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async updateContent(tenantId: string, contentId: string, updates: UpdateContentPayload) {
        const supabase = await createClient();
        const payload: any = {};
        if (updates.title) payload.title = updates.title;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.contentType) payload.content_type = updates.contentType;
        if (updates.fileId !== undefined) payload.file_id = updates.fileId;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.tags !== undefined) payload.tags = updates.tags;
        if (updates.subject !== undefined) payload.subject = updates.subject;
        if (updates.gradeLevel !== undefined) payload.grade_level = updates.gradeLevel;
        if (updates.licenseType !== undefined) payload.license_type = updates.licenseType;
        if (updates.attribution !== undefined) payload.attribution = updates.attribution;
        if (updates.isActive !== undefined) payload.is_active = updates.isActive;
        if (updates.isApproved !== undefined) payload.is_approved = updates.isApproved;

        const { data, error } = await supabase
            .from('content_library')
            .update(payload)
            .eq('school_id', tenantId)
            .eq('id', contentId)
            .select()
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async deleteContent(tenantId: string, contentId: string) {
        const supabase = await createClient();
        const { error } = await supabase
            .from('content_library')
            .delete()
            .eq('school_id', tenantId)
            .eq('id', contentId);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async approveContent(tenantId: string, contentId: string, approverId: string, isApproved: boolean) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('content_library')
            .update({
                is_approved: isApproved,
                approved_by: approverId,
                approved_at: new Date().toISOString(),
            })
            .eq('school_id', tenantId)
            .eq('id', contentId)
            .select()
            .single();
        if (error) throw new AppError(error.message, 500);

        if (data?.created_by) {
            await notificationsService.logNotification(
                data.created_by,
                isApproved ? 'Content Approved' : 'Content Rejected',
                `Your content "${data.title}" has been ${isApproved ? 'approved' : 'rejected'}.`,
                isApproved ? 'success' : 'warning'
            );
        }

        return data;
    }

    async copyToCourse(tenantId: string, contentId: string, courseId: string) {
        const supabase = await createClient();
        const { data: content, error: contentErr } = await supabase
            .from('content_library')
            .select('*')
            .eq('school_id', tenantId)
            .eq('id', contentId)
            .single();
        if (contentErr || !content) throw new AppError('Content not found', 404);

        let fileUrl: string | null = null;
        let fileType: string | null = null;
        let fileSize: number | null = null;

        if (content.file_id) {
            const { data: fileData } = await supabase
                .from('files')
                .select('public_url, file_type, file_size')
                .eq('id', content.file_id)
                .single();
            fileUrl = fileData?.public_url ?? null;
            fileType = fileData?.file_type ?? null;
            fileSize = fileData?.file_size ?? null;
        }

        const { data: material, error: materialErr } = await supabase
            .from('course_materials')
            .insert([{
                course_id: courseId,
                title: content.title,
                description: content.description,
                file_url: fileUrl,
                file_type: fileType ?? content.content_type,
                file_size: fileSize ?? null,
                is_active: true,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (materialErr) throw new AppError(materialErr.message, 500);

        await supabase
            .from('content_library')
            .update({ usage_count: (content.usage_count ?? 0) + 1 })
            .eq('id', contentId);

        return material;
    }

    async rateContent(userId: string, itemId: string, rating: number, review?: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('content_ratings').upsert({
            portal_user_id: userId,
            content_id: itemId,
            rating,
            review: review ?? null,
            created_at: new Date().toISOString()
        }, { onConflict: 'portal_user_id,content_id' });

        if (error) throw new AppError(error.message, 500);

        const { data: ratings } = await supabase
            .from('content_ratings')
            .select('rating')
            .eq('content_id', itemId);

        const values = ratings?.map((r) => r.rating).filter((r) => typeof r === 'number') as number[] | undefined;
        if (values && values.length > 0) {
            const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
            await supabase.from('content_library')
                .update({
                    rating_average: Number(avg.toFixed(2)),
                    rating_count: values.length
                })
                .eq('id', itemId);
        }
        return true;
    }
}

export const libraryService = new LibraryService();
