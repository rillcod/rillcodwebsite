import { createClient } from '@/lib/supabase/client';
import type { UserProfile } from '@/types';

const supabase = () => createClient();

// ─── Auth Service ─────────────────────────────────────────────────────────────

/**
 * Fetch the full profile for the currently authenticated user.
 */
export async function getProfile(userId: string, authClient?: any): Promise<UserProfile | null> {
    const client = authClient || supabase();
    const { data, error } = await client
        .from('portal_users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('[auth.service] getProfile error:', error.message);
        return null;
    }
    return data as UserProfile;
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
    const { error } = await supabase().auth.signOut();
    if (error) {
        console.error('[auth.service] signOut error:', error.message);
        throw new Error(error.message);
    }
}

/**
 * Sign in with email + password.
 */
export async function signIn(
    email: string,
    password: string,
): Promise<{ userId: string } | null> {
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) {
        console.error('[auth.service] signIn error:', error.message);
        throw new Error(error.message);
    }
    return data.user ? { userId: data.user.id } : null;
}

/**
 * Request a password-reset email.
 */
export async function requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
        console.error('[auth.service] requestPasswordReset error:', error.message);
        throw new Error(error.message);
    }
}
