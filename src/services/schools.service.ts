import { createClient } from '@/lib/supabase/client';
import type { School, SchoolFormData, ApiResponse } from '@/types';

const db = () => createClient();

// ─── Schools Service ──────────────────────────────────────────────────────────

/** Fetch all non-deleted schools */
export async function getSchools(): Promise<ApiResponse<School[]>> {
    const { data, error } = await db()
        .from('schools')
        .select('*')
        .eq('is_deleted', false)
        .order('name', { ascending: true });

    return { data: (data as School[]) ?? null, error: error?.message ?? null };
}

/** Fetch all prospective (pending) schools */
export async function getProspectiveSchools(): Promise<ApiResponse<School[]>> {
    const { data, error } = await db()
        .from('schools')
        .select('*')
        .eq('status', 'pending')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

    return { data: (data as School[]) ?? null, error: error?.message ?? null };
}

/** Approve a pending school */
export async function approveSchool(schoolId: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('schools')
        .update({ status: 'approved', is_active: true, updated_at: new Date().toISOString() })
        .eq('id', schoolId);

    return { data: null, error: error?.message ?? null };
}

/** Reject a pending school */
export async function rejectSchool(schoolId: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('schools')
        .update({ status: 'rejected', is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', schoolId);

    return { data: null, error: error?.message ?? null };
}

/** Fetch a single school by ID */
export async function getSchoolById(id: string): Promise<ApiResponse<School>> {
    const { data, error } = await db()
        .from('schools')
        .select('*')
        .eq('id', id)
        .single();

    return { data: (data as School) ?? null, error: error?.message ?? null };
}

/** Register a new partner school */
export async function registerSchool(formData: SchoolFormData): Promise<ApiResponse<School>> {
    const now = new Date().toISOString();
    const { data, error } = await db()
        .from('schools')
        .insert({ ...formData, is_active: true, is_deleted: false, created_at: now, updated_at: now })
        .select()
        .single();

    return { data: (data as School) ?? null, error: error?.message ?? null };
}

/** Update school details */
export async function updateSchool(id: string, updates: Partial<SchoolFormData>): Promise<ApiResponse<School>> {
    const { data, error } = await db()
        .from('schools')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    return { data: (data as School) ?? null, error: error?.message ?? null };
}

/** Soft-delete a school */
export async function deleteSchool(id: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('schools')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', id);

    return { data: null, error: error?.message ?? null };
}
