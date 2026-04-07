// ─── School Types ─────────────────────────────────────────────────────────────

export interface School {
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    student_count?: number;
    /** DB `schools.status` — e.g. `pending` (awaiting approval), `approved`, `rejected` */
    status?: string | null;
    is_active: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
}

export interface SchoolFormData {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
}
