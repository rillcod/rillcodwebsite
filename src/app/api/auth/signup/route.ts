import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
    try {
        // 1. Verify caller is an admin
        const supabase = await createServerClient();
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { data: caller } = await supabase
            .from('portal_users')
            .select('role, school_id')
            .eq('id', user.id)
            .single();

        const { email, password, fullName, role, school_id } = await request.json();

        // Admin can do anything. School users can only create accounts for their own school.
        if (caller?.role !== 'admin') {
            if (caller?.role === 'school') {
                if (school_id !== caller.school_id) {
                    return NextResponse.json({ error: 'You can only create accounts for your own school' }, { status: 403 });
                }
                if (role !== 'school' && role !== 'student' && role !== 'teacher') {
                    return NextResponse.json({ error: 'Invalid role for school manager' }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: 'Unauthorized role creation' }, { status: 403 });
            }
        }

        if (!email || !password || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        let authUserId: string | null = null;
        let authErrorBody: any = null;

        // Try creating the user first
        const { data: authData, error: signupErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: role,
            }
        });

        if (signupErr) {
            // Check if user already exists
            if (signupErr.message.includes('already been registered') || signupErr.message.includes('already exists')) {
                // Look up the existing user to get their ID
                const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                const existing = listData?.users?.find(
                    u => u.email?.trim().toLowerCase() === email.trim().toLowerCase()
                );
                if (existing) {
                    authUserId = existing.id;
                    // Update their password and metadata
                    await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                        password,
                        user_metadata: { full_name: fullName, role: role },
                    });
                } else {
                    authErrorBody = { error: 'User exists in Auth but could not be resolved.' };
                }
            } else {
                authErrorBody = { error: signupErr.message };
            }
        } else {
            authUserId = authData.user?.id ?? null;
        }

        if (authErrorBody) {
            return NextResponse.json(authErrorBody, { status: 400 });
        }

        if (!authUserId) {
            return NextResponse.json({ error: 'User creation/lookup failed' }, { status: 500 });
        }

        // Create or update profile in portal_users table
        const { error: profileError } = await supabaseAdmin
            .from('portal_users')
            .upsert({
                id: authUserId,
                email: email.trim().toLowerCase(),
                full_name: fullName || '',
                role: role,
                school_id: school_id || null,
                is_active: true,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

        if (profileError) {
            return NextResponse.json({ error: `Profile synchronization failed: ${profileError.message}` }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Account synchronized successfully!',
            user_id: authUserId
        });

    } catch (error: any) {
        console.error('Signup error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
