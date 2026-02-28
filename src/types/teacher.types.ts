// ─── Teacher Types ────────────────────────────────────────────────────────────

export interface Teacher {
    id: string;
    email: string;
    full_name: string;
    school_id?: string;
    school_name?: string;
    subjects?: string[];
    phone?: string;
    is_active: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
}

export interface TeacherFormData {
    full_name: string;
    email: string;
    school_id?: string;
    subjects?: string[];
    phone?: string;
}
