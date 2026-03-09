
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanup(email) {
    console.log(`\nProcessing: ${email}`);

    // 1. Find portal user(s)
    const { data: portalUsers } = await supabase.from('portal_users').select('id, email').ilike('email', `%${email}%`);

    if (portalUsers && portalUsers.length > 0) {
        for (const pu of portalUsers) {
            console.log(`- Deleting Portal Row: ${pu.email} (${pu.id})`);

            // Attempt cascade cleanup explicitly just in case
            try { await supabase.from('teacher_schools').delete().eq('teacher_id', pu.id); } catch (e) { }
            try { await supabase.from('enrollments').delete().eq('user_id', pu.id); } catch (e) { }
            try { await supabase.from('payments').delete().eq('user_id', pu.id); } catch (e) { }
            try { await supabase.from('students').update({ user_id: null }).eq('user_id', pu.id); } catch (e) { }

            const { error } = await supabase.from('portal_users').delete().eq('id', pu.id);
            if (error) console.log(`  ! Error deleting portal row: ${error.message}`);
        }
    } else {
        console.log('- No portal rows found.');
    }

    // 2. Find Auth user(s)
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const targeted = authUsers.filter(u => u.email?.toLowerCase().includes(email.toLowerCase()));

    if (targeted.length > 0) {
        for (const au of targeted) {
            console.log(`- Deleting Auth User: ${au.email} (${au.id})`);
            const { error } = await supabase.auth.admin.deleteUser(au.id);
            if (error) console.log(`  ! Error deleting auth user: ${error.message}`);
        }
    } else {
        console.log('- No auth users found.');
    }
}

async function start() {
    await cleanup('admin@rillcod.com');
    await cleanup('amaka@rillcod.com');
    await cleanup('amaka2@rillcod.com');
    console.log('\nCleanup finished.');
}

start();
