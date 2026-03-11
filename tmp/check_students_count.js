require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function check() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing env');
        process.exit(1);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const { count: sCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
        const { count: pCount } = await supabase.from('portal_users').select('*', { count: 'exact', head: true }).eq('role', 'student');
        const { count: mappedCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).not('user_id', 'is', null);

        console.log({
            total_students_registry: sCount,
            total_portal_students: pCount,
            students_with_user_id: mappedCount
        });

        const { data: schools } = await supabase.from('schools').select('id, name');
        console.log('Schools:', schools);

        const { data: sampleStudents } = await supabase.from('students').select('full_name, school_name, school_id, user_id').limit(5);
        console.log('Sample Students Registry:', sampleStudents);

        const { data: samplePortalUsers } = await supabase.from('portal_users').select('full_name, school_name, school_id, role').eq('role', 'student').limit(5);
        console.log('Sample Portal Users (Students):', samplePortalUsers);
    } catch (err) {
        console.error('Error:', err);
    }
}

check();
