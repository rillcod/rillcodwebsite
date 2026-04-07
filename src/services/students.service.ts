import { createClient } from '@/lib/supabase/client';
import type { Student, ProspectiveStudent, StudentFormData, ApiResponse } from '@/types';
import type { Database } from '@/types/supabase';

const db = () => createClient();

type PortalUserInsert = Database['public']['Tables']['portal_users']['Insert'];
type StudentsRow = Database['public']['Tables']['students']['Row'];

/** Map `students` registration row → `ProspectiveStudent` (used by admin approval UI). */
function studentsRowToProspectiveStudent(row: StudentsRow): ProspectiveStudent {
    return {
        id: row.id,
        email: (row.student_email?.trim() || row.email?.trim() || '') as string,
        full_name: (row.full_name?.trim() || row.name?.trim() || '') as string,
        age: row.age ?? 0,
        grade: row.grade?.trim() || row.grade_level?.trim() || '',
        school_id: row.school_id ?? '',
        school_name: row.school_name ?? '',
        gender: row.gender ?? '',
        parent_name: row.parent_name ?? '',
        parent_phone: row.parent_phone ?? '',
        parent_email: row.parent_email ?? '',
        course_interest: row.course_interest ?? '',
        preferred_schedule: row.preferred_schedule ?? '',
        hear_about_us: row.hear_about_us ?? row.heard_about_us ?? '',
        is_active: row.is_active ?? false,
        is_deleted: row.is_deleted ?? false,
        created_at: row.created_at ?? '',
        updated_at: row.updated_at ?? '',
    };
}

// ─── Students Service ─────────────────────────────────────────────────────────

/** Fetch all non-deleted portal_users with role = 'student' */
export async function getStudents(schoolId?: string): Promise<ApiResponse<Student[]>> {
    let query = db()
        .from('portal_users')
        .select('*')
        .eq('role', 'student')
        .neq('is_deleted', true)
        .order('created_at', { ascending: false });

    if (schoolId) {
        query = query.eq('school_id', schoolId);
    }

    const { data, error } = await query;
    return {
        data: (data as unknown as Student[]) ?? null,
        error: error?.message ?? null,
    };
}

/** Fetch a single student by ID */
export async function getStudentById(id: string): Promise<ApiResponse<Student>> {
    const { data, error } = await db()
        .from('portal_users')
        .select('*')
        .eq('id', id)
        .eq('role', 'student')
        .single();

    return { data: (data as unknown as Student) ?? null, error: error?.message ?? null };
}

/** Pending rows on `students` (not `prospective_students`) — normalized for approval UI. */
export async function getProspectiveStudents(): Promise<ApiResponse<ProspectiveStudent[]>> {
    const { data, error } = await db()
        .from('students')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) return { data: null, error: error.message };

    return { data: (data ?? []).map(studentsRowToProspectiveStudent), error: null };
}

/** Approve a pending student — creates portal_users entry + marks students status as approved */
export async function approveStudent(
    studentId: string,
    studentData: ProspectiveStudent
): Promise<ApiResponse<null>> {
    const client = db();

    const loginEmail = studentData.email?.trim();
    if (!loginEmail) {
        return { data: null, error: 'Cannot approve: missing student email' };
    }

    // Registration details stay on `students`; portal_users uses typed columns only (no `metadata` column required).
    const now = new Date().toISOString();
    const insertPayload: PortalUserInsert = {
        email: loginEmail,
        full_name: studentData.full_name,
        role: 'student',
        is_active: true,
        is_deleted: false,
        school_id: studentData.school_id?.trim() || null,
        school_name: studentData.school_name ?? null,
        section_class: studentData.grade ?? null,
        student_id: studentId,
        phone: studentData.parent_phone ?? null,
        created_at: now,
        updated_at: now,
    };

    const { error: createError } = await client.from('portal_users').insert(insertPayload);

    if (createError) return { data: null, error: createError.message };

    const { error: updateError } = await client
        .from('students')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', studentId);

    return { data: null, error: updateError?.message ?? null };
}

/** Reject a pending student */
export async function rejectStudent(studentId: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('students')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', studentId);

    return { data: null, error: error?.message ?? null };
}

/** Create a new student record directly */
export async function createStudent(formData: StudentFormData): Promise<ApiResponse<Student>> {
    const now = new Date().toISOString();
    const insertPayload: PortalUserInsert = {
        email: formData.email,
        full_name: formData.full_name,
        role: 'student',
        is_active: true,
        is_deleted: false,
        school_id: formData.school_id ?? null,
        section_class: formData.grade_level ?? null,
        phone: formData.parent_phone ?? null,
        created_at: now,
        updated_at: now,
    };
    const { data, error } = await db()
        .from('portal_users')
        .insert(insertPayload)
        .select()
        .single();

    return { data: (data as unknown as Student) ?? null, error: error?.message ?? null };
}

/** Soft-delete a student */
export async function deleteStudent(id: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('portal_users')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', id);

    return { data: null, error: error?.message ?? null };
}
