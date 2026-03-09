
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup(email) {
    console.log(`\n--- Cleaning up: ${email} ---`);

    // Find portal user
    const { data: portalRows } = await supabase
        .from('portal_users')
        .select('id, email')
        .ilike('email', `%${email}%`);

    if (!portalRows || portalRows.length === 0) {
        console.log(`No portal user found for ${email}`);
    } else {
        for (const row of portalRows) {
            console.log(`Found Portal User: ${row.email} (${row.id})`);

            // Nullify references in common tables to avoid foreign key errors or to clean up data
            // For some tables, we might want to DELETE instead of NULLIFY if they are "junction" tables.

            // 1. teacher_schools (junction) - DELETE
            await supabase.from('teacher_schools').delete().eq('teacher_id', row.id);

            // 2. enrollments (data) - DELETE (as requested "with the data")
            await supabase.from('enrollments').delete().eq('user_id', row.id);

            // 3. payments (data) - DELETE
            await supabase.from('payments').delete().eq('user_id', row.id);

            // 4. student record linking - NULLIFY
            await supabase.from('students').update({ user_id: null }).eq('user_id', row.id);

            // 5. Discussion topics/replies - DELETE or Nullify? User said "with the data"
            await supabase.from('discussion_replies').delete().eq('created_by', row.id);
            await supabase.from('discussion_topics').delete().eq('created_by', row.id);

            // Now delete the portal user
            const { error } = await supabase.from('portal_users').delete().eq('id', row.id);
            if (error) {
                console.error(`Failed to delete portal user ${row.email}: ${error.message}`);
            } else {
                console.log(`Successfully deleted portal user ${row.email}`);
            }
        }
    }

    // Also search Auth for good measure
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const amakas = authUsers.filter(u => u.email?.toLowerCase().includes(email.toLowerCase()));
    for (const u of amakas) {
        console.log(`Found Auth User: ${u.email} (${u.id}) - Deleting...`);
        await supabase.auth.admin.deleteUser(u.id);
    }
}

async function run() {
    await cleanup('admin@rillcod.com');
    await cleanup('amaka@rillcod.com');
    await cleanup('amaka2@rillcod.com');
    console.log('Cleanup finished.');
}

run().catch(console.error);
