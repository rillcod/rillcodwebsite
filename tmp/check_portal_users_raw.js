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
        const { data: students } = await supabase.from('portal_users').select('id, full_name, school_name, school_id, role, is_active, is_deleted').eq('role', 'student');
        console.log('STUDENTS:', JSON.stringify(students, null, 2));

        const { data: all_students_raw } = await supabase.from('portal_users').select('id, full_name, role').eq('role', 'student');
        console.log('ALL STUDENTS RAW:', JSON.stringify(all_students_raw, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

check();
