// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'teacher' | 'student';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown>;
}

export interface AuthContextType {
    user: import('@supabase/supabase-js').User | null;
    session: import('@supabase/supabase-js').Session | null;
    profile: UserProfile | null;
    isLoading: boolean;
    loading: boolean;
    login: any;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}
