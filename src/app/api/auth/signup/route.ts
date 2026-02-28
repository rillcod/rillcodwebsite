import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
    try {
        const { email, password, fullName, role } = await request.json();

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
