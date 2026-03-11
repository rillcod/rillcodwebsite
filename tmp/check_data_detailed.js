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
        const { data: students } = await supabase.from('portal_users').select('id, full_name, school_name, school_id').eq('role', 'student');
        const { data: schools } = await supabase.from('schools').select('id, name');

        console.log('--- ALL STUDENTS ---');
        console.table(students);

        console.log('--- ALL SCHOOLS ---');
        console.table(schools);

        // Also check registry for mapping
        const { data: registry } = await supabase.from('students').select('id, full_name, school_name, school_id, user_id');
        console.log('--- REGISTRY ---');
        console.table(registry);

    } catch (err) {
        console.error('Error:', err);
    }
}

check();
