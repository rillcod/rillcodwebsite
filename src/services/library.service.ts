import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';
import type { Database } from '@/types/supabase';

export type ContentType = 'video' | 'document' | 'quiz' | 'presentation' | 'interactive';

type ContentLibraryRow = Database['public']['Tables']['content_library']['Row'];
type ContentLibraryUpdate = Database['public']['Tables']['content_library']['Update'];

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
    page?: number;
    pageSize?: number;
    role?: string | null;
}

function isStaffRole(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'teacher' || role === 'school';
}

/** Create / update / delete / copy-to-course: only these roles (not `school`). */
function isLibraryMutatorRole(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'teacher';
}

/** Same visibility rules as list: active, approval, and school/global scope. */
function canViewLibraryRow(row: ContentLibraryRow, tenantId: string | undefined, role: string | undefined): boolean {
    if (!row.is_active) return false;
    if (!isStaffRole(role) && !row.is_approved) return false;
    if (tenantId) {
        return row.school_id == null || row.school_id === tenantId;
    }
    if (role === 'admin') return true;
    return row.school_id == null;
}

/** Admin anywhere; teacher only for their school’s rows. Global catalog rows: admin only. */
function canMutateLibraryRow(row: ContentLibraryRow, tenantId: string | undefined, role: string | undefined): boolean {
    if (!isLibraryMutatorRole(role)) return false;
    if (role === 'admin') return true;
    if (row.school_id == null) return false;
    return !!tenantId && row.school_id === tenantId;
}

export class LibraryService {
    async createContent(tenantId: string | null | undefined, authorId: string, role: string, data: CreateContentPayload) {
        const supabase = await createClient();
        const now = new Date().toISOString();
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
                is_active: true,
                is_approved: role === 'admin' || role === 'teacher',
                created_at: now,
                updated_at: now,
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);
        return item;
    }

    async listContent(schoolIds: string | string[] | undefined, filters: ListFilters = {}) {
        const supabase = await createClient();
        const pageSize = Math.min(filters.pageSize ?? 50, 100);
        const page = Math.max(filters.page ?? 0, 0);
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const role = filters.role ?? undefined;

        let query = supabase
            .from('content_library')
            .select('id, title, description, content_type, category, tags, subject, grade_level, rating_average, rating_count, usage_count, is_active, is_approved, school_id, created_at, created_by, file_id, files(public_url, file_type, thumbnail_url, file_size)');

        const ids = typeof schoolIds === 'string' ? [schoolIds] : schoolIds;
        if (ids && ids.length > 0) {
            query = query.or(`school_id.in.(${ids.join(',')}),school_id.is.null`);
        } else if (role !== 'admin') {
            query = query.is('school_id', null);
        }

        if (filters.type) query = query.eq('content_type', filters.type);
        if (filters.tag) query = query.contains('tags', [filters.tag]);
        if (filters.subject) query = query.eq('subject', filters.subject);
        if (filters.gradeLevel) query = query.eq('grade_level', filters.gradeLevel);
        if (filters.query) {
            query = query.ilike('title', `%${filters.query}%`);
        }

        query = query.eq('is_active', true);
        if (!isStaffRole(role)) {
            query = query.eq('is_approved', true);
        }

        const sortColumn = filters.sort ?? 'created_at';
        const ascending = (filters.order ?? 'desc') === 'asc';

        const { data, error } = await query.order(sortColumn, { ascending }).range(from, to);
        if (error) throw new AppError(error.message, 500);
        return data ?? [];
    }

    async getContent(contentId: string, tenantId: string | undefined, role: string | undefined) {
        const supabase = await createClient();
        const { data: row, error } = await supabase
            .from('content_library')
            .select('*, files(public_url, file_type, thumbnail_url, file_size, mime_type)')
            .eq('id', contentId)
            .single();
        if (error || !row) throw new AppError('Content not found', 404);
        if (!canViewLibraryRow(row as ContentLibraryRow, tenantId, role)) {
            throw new AppError('Forbidden', 403);
        }
        return row;
    }

    async updateContent(contentId: string, tenantId: string | undefined, role: string | undefined, updates: UpdateContentPayload) {
        const supabase = await createClient();
        const { data: row, error: fetchErr } = await supabase
            .from('content_library')
            .select('*')
            .eq('id', contentId)
            .single();
        if (fetchErr || !row) throw new AppError('Content not found', 404);
        if (!canMutateLibraryRow(row as ContentLibraryRow, tenantId, role)) {
            throw new AppError('Forbidden', 403);
        }

        const payload: ContentLibraryUpdate = { updated_at: new Date().toISOString() };
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
        if (updates.isApproved !== undefined && role === 'admin') payload.is_approved = updates.isApproved;

        const { data, error } = await supabase
            .from('content_library')
            .update(payload)
            .eq('id', contentId)
            .select()
            .single();
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async deleteContent(contentId: string, tenantId: string | undefined, role: string | undefined) {
        const supabase = await createClient();
        const { data: row, error: fetchErr } = await supabase
            .from('content_library')
            .select('id, school_id')
            .eq('id', contentId)
            .single();
        if (fetchErr || !row) throw new AppError('Content not found', 404);
        if (!canMutateLibraryRow(row as ContentLibraryRow, tenantId, role)) {
            throw new AppError('Forbidden', 403);
        }

        const { error } = await supabase.from('content_library').delete().eq('id', contentId);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async approveContent(contentId: string, approverId: string, isApproved: boolean) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('content_library')
            .update({
                is_approved: isApproved,
                approved_by: approverId,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
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

    async copyToCourse(tenantId: string | undefined, contentId: string, courseId: string, role: string | undefined) {
        const supabase = await createClient();
        const { data: content, error: contentErr } = await supabase
            .from('content_library')
            .select('*')
            .eq('id', contentId)
            .single();
        if (contentErr || !content) throw new AppError('Content not found', 404);
        if (!canViewLibraryRow(content as ContentLibraryRow, tenantId, role)) {
            throw new AppError('Forbidden', 403);
        }

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

        const now = new Date().toISOString();
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
                created_at: now,
            }])
            .select()
            .single();

        if (materialErr) throw new AppError(materialErr.message, 500);

        await supabase
            .from('content_library')
            .update({
                usage_count: (content.usage_count ?? 0) + 1,
                updated_at: now,
            })
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
            created_at: new Date().toISOString(),
        }, { onConflict: 'portal_user_id,content_id' });

        if (error) throw new AppError(error.message, 500);

        const { data: ratings } = await supabase
            .from('content_ratings')
            .select('rating')
            .eq('content_id', itemId);

        const values = ratings?.map((r) => r.rating).filter((r): r is number => typeof r === 'number');
        if (values && values.length > 0) {
            const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
            await supabase.from('content_library')
                .update({
                    rating_average: Number(avg.toFixed(2)),
                    rating_count: values.length,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', itemId);
        }
        return true;
    }
}

export const libraryService = new LibraryService();
