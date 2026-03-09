
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log('Searching for Amaka...');

    // 1. Search portal_users
    const { data: portalUsers } = await supabase
        .from('portal_users')
        .select('id, email, full_name')
        .or('email.ilike.%amaka%,full_name.ilike.%amaka%');

    console.log('Portal Users found:', portalUsers);

    // 2. Search auth.users (can't directly query with ilike via regular client, but can list)
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const amakaAuth = authUsers.filter(u =>
        u.email?.toLowerCase().includes('amaka') ||
        u.user_metadata?.full_name?.toLowerCase().includes('amaka')
    );
    console.log('Auth Users found:', amakaAuth.map(u => ({ id: u.id, email: u.email })));

    // 3. Search students
    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_email, parent_email')
        .or('student_email.ilike.%amaka%,parent_email.ilike.%amaka%,full_name.ilike.%amaka%');
    console.log('Students found:', students);

    // 4. Search schools
    const { data: schools } = await supabase
        .from('schools')
        .select('id, name, email')
        .or('email.ilike.%amaka%,name.ilike.%amaka%');
    console.log('Schools found:', schools);

    // --- DELETE LOGIC ---
    for (const u of portalUsers || []) {
        console.log(`Deleting Portal User: ${u.email}`);
        await supabase.from('portal_users').delete().eq('id', u.id);
    }

    for (const u of amakaAuth || []) {
        console.log(`Deleting Auth User: ${u.email}`);
        await supabase.auth.admin.deleteUser(u.id);
    }

    for (const s of students || []) {
        console.log(`Deleting Student: ${s.full_name}`);
        await supabase.from('students').delete().eq('id', s.id);
    }

    for (const s of schools || []) {
        console.log(`Deleting School: ${s.name}`);
        await supabase.from('schools').delete().eq('id', s.id);
    }

    console.log('Cleanup complete.');
}

cleanup().catch(console.error);
