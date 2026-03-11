const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAlignment() {
    const { data: students, error: studErr } = await supabase
        .from('students')
        .select('id, user_id, school_id, full_name')
        .eq('status', 'approved')
        .not('user_id', 'is', null)
        .limit(10);

    if (studErr) {
        console.error(studErr);
        return;
    }

    for (const s of students) {
        const { data: pUser } = await supabase
            .from('portal_users')
            .select('id, school_id, full_name')
            .eq('id', s.user_id)
            .single();

        console.log(`Student: ${s.full_name}, ID: ${s.user_id}`);
        console.log(`  students table school_id: ${s.school_id}`);
        console.log(`  portal_users table school_id: ${pUser?.school_id}`);
    }
}

checkAlignment();
