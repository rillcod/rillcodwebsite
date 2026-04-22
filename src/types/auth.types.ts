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
    grade_level?: string | null;
    enrollment_type?: string | null;
}

export interface AuthContextType {
    user: import('@supabase/supabase-js').User | null;
    session: import('@supabase/supabase-js').Session | null;
    /**
     * The effective profile seen by the UI. When the signed-in user is
     * running a "view as role" simulation (admin/teacher only) the `role`
     * field on this object is overridden. Server-side APIs always see the
     * REAL role from the JWT — the simulation is UI-only.
     */
    profile: UserProfile | null;
    /** The real role on the JWT/database, unaffected by simulation. */
    actualRole: UserRole | null;
    /** The role currently being previewed, or null when no simulation is active. */
    viewAsRole: UserRole | null;
    /** True if actualRole !== effective profile.role (i.e. simulating). */
    isSimulating: boolean;
    /** Only admins + teachers may simulate; teachers cannot simulate 'admin'. */
    setViewAsRole: (role: UserRole | null) => void;
    isLoading: boolean;
    loading: boolean;
    /** True while the profile row is being fetched (user is known but profile not yet loaded) */
    profileLoading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}
