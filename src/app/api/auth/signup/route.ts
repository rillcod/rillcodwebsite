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

        // Use admin API to create user with email auto-confirmed
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: role,
            }
        });

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        const userId = authData.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
        }

        // Create profile in portal_users table
        const { error: profileError } = await supabaseAdmin
            .from('portal_users')
            .upsert({
                id: userId,
                email,
                full_name: fullName || '',
                role: role,
                school_id: school_id || null,
                is_active: true,
                created_at: new Date().toISOString(),
            });

        if (profileError) {
            // If profile fails, delete user to rollback
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return NextResponse.json({ error: profileError.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'Account created and confirmed successfully!' });

    } catch (error: any) {
        console.error('Signup error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
