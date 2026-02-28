// ─── Student Types ────────────────────────────────────────────────────────────

export interface Student {
    id: string;
    email: string;
    full_name: string;
    age?: number;
    grade_level?: string;
    school_id?: string;
    school_name?: string;
    gender?: string;
    parent_name?: string;
    parent_phone?: string;
    parent_email?: string;
    status: 'active' | 'inactive' | 'pending';
    is_active: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
}

export interface ProspectiveStudent {
    id: string;
    email: string;
    full_name: string;
    age: number;
    grade: string;
    school_id: string;
    school_name: string;
    gender: string;
    parent_name: string;
    parent_phone: string;
    parent_email: string;
    course_interest: string;
    preferred_schedule: string;
    hear_about_us: string;
    is_active: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
}

export interface StudentFormData {
    full_name: string;
    email: string;
    age?: number;
    grade_level?: string;
    school_id?: string;
    parent_name?: string;
    parent_phone?: string;
    parent_email?: string;
}
