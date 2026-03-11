require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function check() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: students } = await supabase.from('portal_users').select('id, full_name, is_active, is_deleted').eq('role', 'student');
    console.log(JSON.stringify(students, null, 2));
}

check();
