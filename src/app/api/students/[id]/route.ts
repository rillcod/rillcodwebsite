import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

// PATCH /api/students/[id] — update a pre-portal student record (admin/teacher/school)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    // Whitelist updatable fields
    const allowed: Record<string, any> = {};
    const fields = ['full_name', 'name', 'parent_name', 'parent_email', 'parent_phone',
        'school_name', 'school_id', 'grade_level', 'section_class', 'city', 'state',
        'gender', 'date_of_birth', 'enrollment_type', 'status'];
    fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
    if (body.full_name) allowed.name = body.full_name; // keep name in sync
    allowed.updated_at = new Date().toISOString();

    const { data, error } = await adminClient().from('students').update(allowed).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const admin = adminClient();

    const { data: student } = await admin.from('students').select('user_id').eq('id', id).single();

    if (student?.user_id) {
        await admin.from('portal_users').delete().eq('id', student.user_id);
        await admin.auth.admin.deleteUser(student.user_id);
    }

    const { error } = await admin.from('students').delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
