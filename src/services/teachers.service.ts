import { createClient } from '@/lib/supabase/client';
import type { Teacher, TeacherFormData, ApiResponse } from '@/types';
import type { Database } from '@/types/supabase';

const db = () => createClient();

type PortalUserInsert = Database['public']['Tables']['portal_users']['Insert'];
type PortalUserUpdate = Database['public']['Tables']['portal_users']['Update'];
type PortalUserRow = Database['public']['Tables']['portal_users']['Row'];

function portalUserRowToTeacher(row: PortalUserRow): Teacher {
    return {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        school_id: row.school_id ?? undefined,
        school_name: row.school_name ?? undefined,
        phone: row.phone ?? undefined,
        is_active: row.is_active ?? false,
        is_deleted: row.is_deleted ?? false,
        created_at: row.created_at ?? '',
        updated_at: row.updated_at ?? '',
    };
}

// ─── Teachers Service ─────────────────────────────────────────────────────────
// Subjects are not stored on `portal_users` (no dedicated column); only returned on create/update responses from the form payload.

/** Fetch all active teachers */
export async function getTeachers(schoolId?: string): Promise<ApiResponse<Teacher[]>> {
    let query = db()
        .from('portal_users')
        .select('*')
        .eq('role', 'teacher')
        .neq('is_deleted', true)
        .order('full_name', { ascending: true });

    if (schoolId) {
        query = query.eq('school_id', schoolId);
    }

    const { data, error } = await query;
    return {
        data: data?.map(portalUserRowToTeacher) ?? null,
        error: error?.message ?? null,
    };
}

/** Fetch a single teacher by ID */
export async function getTeacherById(id: string): Promise<ApiResponse<Teacher>> {
    const { data, error } = await db()
        .from('portal_users')
        .select('*')
        .eq('id', id)
        .eq('role', 'teacher')
        .single();

    return {
        data: data ? portalUserRowToTeacher(data) : null,
        error: error?.message ?? null,
    };
}

/** Create a new teacher account */
export async function createTeacher(formData: TeacherFormData): Promise<ApiResponse<Teacher>> {
    const now = new Date().toISOString();
    const insertPayload: PortalUserInsert = {
        email: formData.email,
        full_name: formData.full_name,
        role: 'teacher',
        is_active: true,
        is_deleted: false,
        school_id: formData.school_id?.trim() || null,
        phone: formData.phone ?? null,
        created_at: now,
        updated_at: now,
    };
    const { data, error } = await db()
        .from('portal_users')
        .insert(insertPayload)
        .select()
        .single();

    if (!data) {
        return { data: null, error: error?.message ?? null };
    }
    const teacher = portalUserRowToTeacher(data);
    if (formData.subjects?.length) {
        teacher.subjects = formData.subjects;
    }
    return { data: teacher, error: error?.message ?? null };
}

/** Update a teacher's details */
export async function updateTeacher(id: string, updates: Partial<TeacherFormData>): Promise<ApiResponse<Teacher>> {
    const payload: PortalUserUpdate = { updated_at: new Date().toISOString() };
    if (updates.full_name !== undefined) payload.full_name = updates.full_name;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.school_id !== undefined) payload.school_id = updates.school_id?.trim() || null;
    if (updates.phone !== undefined) payload.phone = updates.phone ?? null;

    const { data, error } = await db()
        .from('portal_users')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (!data) {
        return { data: null, error: error?.message ?? null };
    }
    const teacher = portalUserRowToTeacher(data);
    if (updates.subjects !== undefined) {
        teacher.subjects = updates.subjects;
    }
    return { data: teacher, error: error?.message ?? null };
}

/** Soft-delete a teacher */
export async function deleteTeacher(id: string): Promise<ApiResponse<null>> {
    const softDelete: PortalUserUpdate = {
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString(),
    };
    const { error } = await db().from('portal_users').update(softDelete).eq('id', id);

    return { data: null, error: error?.message ?? null };
}
