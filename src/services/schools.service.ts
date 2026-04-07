import { createClient } from '@/lib/supabase/client';
import type { School, SchoolFormData, ApiResponse } from '@/types';
import type { Database } from '@/types/supabase';

const db = () => createClient();

type SchoolInsert = Database['public']['Tables']['schools']['Insert'];
type SchoolUpdate = Database['public']['Tables']['schools']['Update'];
type SchoolRow = Database['public']['Tables']['schools']['Row'];

/** Map Supabase row → app `School` (DB uses `contact_person` / `email` / `phone`). */
export function schoolRowToSchool(row: SchoolRow): School {
    return {
        id: row.id,
        name: row.name,
        address: row.address ?? undefined,
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        contact_name: row.contact_person ?? undefined,
        contact_email: row.email ?? undefined,
        contact_phone: row.phone ?? undefined,
        student_count: row.student_count ?? undefined,
        status: row.status,
        is_active: row.is_active ?? false,
        is_deleted: row.is_deleted ?? false,
        created_at: row.created_at ?? '',
        updated_at: row.updated_at ?? '',
    };
}

function formDataToInsert(
    form: SchoolFormData,
    timestamps: { created_at: string; updated_at: string }
): SchoolInsert {
    return {
        name: form.name,
        address: form.address ?? null,
        city: form.city ?? null,
        state: form.state ?? null,
        contact_person: form.contact_name,
        email: form.contact_email,
        phone: form.contact_phone,
        is_active: true,
        is_deleted: false,
        // Queues the school for staff approval (`getProspectiveSchools` filters `status = pending`).
        status: 'pending',
        created_at: timestamps.created_at,
        updated_at: timestamps.updated_at,
    };
}

function partialFormDataToUpdate(updates: Partial<SchoolFormData>): SchoolUpdate {
    const out: SchoolUpdate = {};
    if (updates.name !== undefined) out.name = updates.name;
    if (updates.address !== undefined) out.address = updates.address ?? null;
    if (updates.city !== undefined) out.city = updates.city ?? null;
    if (updates.state !== undefined) out.state = updates.state ?? null;
    if (updates.contact_name !== undefined) out.contact_person = updates.contact_name;
    if (updates.contact_email !== undefined) out.email = updates.contact_email;
    if (updates.contact_phone !== undefined) out.phone = updates.contact_phone;
    return out;
}

// ─── Schools Service ──────────────────────────────────────────────────────────

/** Fetch all non-deleted schools */
export async function getSchools(): Promise<ApiResponse<School[]>> {
    const { data, error } = await db()
        .from('schools')
        .select('*')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('name', { ascending: true });

    return { data: data?.map(schoolRowToSchool) ?? null, error: error?.message ?? null };
}

/** Fetch all prospective (pending) schools */
export async function getProspectiveSchools(): Promise<ApiResponse<School[]>> {
    const { data, error } = await db()
        .from('schools')
        .select('*')
        .eq('status', 'pending')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', { ascending: false });

    return { data: data?.map(schoolRowToSchool) ?? null, error: error?.message ?? null };
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

    return { data: data ? schoolRowToSchool(data) : null, error: error?.message ?? null };
}

/** Register a new partner school */
export async function registerSchool(formData: SchoolFormData): Promise<ApiResponse<School>> {
    const now = new Date().toISOString();
    const { data, error } = await db()
        .from('schools')
        .insert(formDataToInsert(formData, { created_at: now, updated_at: now }))
        .select()
        .single();

    return { data: data ? schoolRowToSchool(data) : null, error: error?.message ?? null };
}

/** Update school details */
export async function updateSchool(id: string, updates: Partial<SchoolFormData>): Promise<ApiResponse<School>> {
    const { data, error } = await db()
        .from('schools')
        .update({
            ...partialFormDataToUpdate(updates),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    return { data: data ? schoolRowToSchool(data) : null, error: error?.message ?? null };
}

/** Soft-delete a school */
export async function deleteSchool(id: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('schools')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', id);

    return { data: null, error: error?.message ?? null };
}
