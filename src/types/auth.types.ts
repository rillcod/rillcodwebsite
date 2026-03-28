// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'teacher' | 'student' | 'school' | 'parent';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
    is_deleted?: boolean;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown>;
    school_id?: string;
    school_name?: string;
    section_class?: string;
    current_module?: string;
    date_of_birth?: string;
    phone?: string;
    bio?: string;
    profile_image_url?: string;
}

export interface AuthContextType {
    user: import('@supabase/supabase-js').User | null;
    session: import('@supabase/supabase-js').Session | null;
    profile: UserProfile | null;
    isLoading: boolean;
    loading: boolean;
    /** True while the profile row is being fetched (user is known but profile not yet loaded) */
    profileLoading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}
