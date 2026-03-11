import { createClient } from '@/lib/supabase/client';
import type { Teacher, TeacherFormData, ApiResponse } from '@/types';

const db = () => createClient();

// ─── Teachers Service ─────────────────────────────────────────────────────────

/** Fetch all active teachers */
export async function getTeachers(schoolId?: string): Promise<ApiResponse<Teacher[]>> {
    let query = db()
        .from('portal_users')
        .select('*')
        .eq('role', 'teacher')
        .neq('is_deleted', true)
        .order('full_name', { ascending: true });

    if (schoolId) {
        query = query.eq('metadata->>school_id', schoolId);
    }

    const { data, error } = await query;
    return { data: (data as Teacher[]) ?? null, error: error?.message ?? null };
}

/** Fetch a single teacher by ID */
export async function getTeacherById(id: string): Promise<ApiResponse<Teacher>> {
    const { data, error } = await db()
        .from('portal_users')
        .select('*')
        .eq('id', id)
        .eq('role', 'teacher')
        .single();

    return { data: (data as Teacher) ?? null, error: error?.message ?? null };
}

/** Create a new teacher account */
export async function createTeacher(formData: TeacherFormData): Promise<ApiResponse<Teacher>> {
    const now = new Date().toISOString();
    const { data, error } = await db()
        .from('portal_users')
        .insert({ ...formData, role: 'teacher', is_active: true, is_deleted: false, created_at: now, updated_at: now })
        .select()
        .single();

    return { data: (data as Teacher) ?? null, error: error?.message ?? null };
}

/** Update a teacher's details */
export async function updateTeacher(id: string, updates: Partial<TeacherFormData>): Promise<ApiResponse<Teacher>> {
    const { data, error } = await db()
        .from('portal_users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    return { data: (data as Teacher) ?? null, error: error?.message ?? null };
}

/** Soft-delete a teacher */
export async function deleteTeacher(id: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('portal_users')
        .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

    return { data: null, error: error?.message ?? null };
}
