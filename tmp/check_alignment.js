const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('--- Schools vs Portal Users ---');
    const { data: schools } = await supabase.from('schools').select('id, name, email, status').is('is_deleted', false);
    const { data: portalUsers } = await supabase.from('portal_users').select('id, email, school_id, role');

    const portalBySchoolId = new Map(portalUsers.filter(u => u.school_id).map(u => [u.school_id, u]));
    const portalByEmail = new Map(portalUsers.map(u => [u.email?.toLowerCase(), u]));

    schools.forEach(s => {
        const p1 = portalBySchoolId.get(s.id);
        const p2 = s.email ? portalByEmail.get(s.email.toLowerCase()) : null;

        if (p1 || p2) {
            console.log(`[OK] School: ${s.name} (${s.status}) -> Portal: ${p1?.email || p2?.email} (Role: ${p1?.role || p2?.role})`);
        } else {
            console.log(`[MISSING] School: ${s.name} (${s.status}) - Email: ${s.email}`);
        }
    });

    console.log('\n--- Portal Users with no School (Role: school) ---');
    portalUsers.filter(u => u.role === 'school' && !schools.find(s => s.id === u.school_id)).forEach(u => {
        console.log(`[ORPHAN PORTAL] ${u.email} (School ID: ${u.school_id})`);
    });
}

check();
