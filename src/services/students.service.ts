import { createClient } from '@/lib/supabase/client';
import type { Student, ProspectiveStudent, StudentFormData, ApiResponse } from '@/types';

const db = () => createClient();

// ─── Students Service ─────────────────────────────────────────────────────────

/** Fetch all non-deleted portal_users with role = 'student' */
export async function getStudents(schoolId?: string): Promise<ApiResponse<Student[]>> {
    let query = db()
        .from('portal_users')
        .select('*')
        .eq('role', 'student')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

    if (schoolId) {
        query = query.eq('metadata->>school_id', schoolId);
    }

    const { data, error } = await query;
    return {
        data: (data as Student[]) ?? null,
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

    return { data: (data as Student) ?? null, error: error?.message ?? null };
}

/** Fetch all pending students from the frontend registration */
export async function getProspectiveStudents(): Promise<ApiResponse<any[]>> {
    const { data, error } = await db()
        .from('students')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) return { data: null, error: error.message };

    return { data: data, error: null };
}

/** Approve a pending student — creates portal_users entry + marks students status as approved */
export async function approveStudent(studentId: string, studentData: any): Promise<ApiResponse<null>> {
    const client = db();

    const { error: createError } = await client
        .from('portal_users')
        .insert({
            email: studentData.email,
            full_name: studentData.full_name,
            role: 'student',
            is_active: true,
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {
                student_id: studentId,
                school_id: studentData.school_id,
                grade: studentData.grade,
                age: studentData.age,
                gender: studentData.gender,
                parent_name: studentData.parent_name,
                parent_phone: studentData.parent_phone,
                parent_email: studentData.parent_email,
                course_interest: studentData.course_interest,
                preferred_schedule: studentData.preferred_schedule,
            },
        });

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
    const { data, error } = await db()
        .from('portal_users')
        .insert({ ...formData, role: 'student', is_active: true, is_deleted: false, created_at: now, updated_at: now })
        .select()
        .single();

    return { data: (data as Student) ?? null, error: error?.message ?? null };
}

/** Soft-delete a student */
export async function deleteStudent(id: string): Promise<ApiResponse<null>> {
    const { error } = await db()
        .from('portal_users')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', id);

    return { data: null, error: error?.message ?? null };
}
