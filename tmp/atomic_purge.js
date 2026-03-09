
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function purgeUser(email) {
    console.log(`\n--- Purging: ${email} ---`);

    const { data: portalUsers } = await supabase.from('portal_users').select('id, email').ilike('email', `%${email}%`);

    if (portalUsers && portalUsers.length > 0) {
        for (const pu of portalUsers) {
            console.log(`Targeting Portal User: ${pu.email} (${pu.id})`);

            // 1. Handle Foreign Key Constraints (Nullify or Delete)
            console.log('  Cleaning dependencies...');

            // Announcements
            try { await supabase.from('announcements').update({ author_id: null }).eq('author_id', pu.id); } catch (e) { }

            // Classes (Teacher link)
            try { await supabase.from('classes').update({ teacher_id: null }).eq('teacher_id', pu.id); } catch (e) { }

            // Discussion Topics & Replies
            try { await supabase.from('discussion_replies').delete().eq('created_by', pu.id); } catch (e) { }
            try { await supabase.from('discussion_topics').delete().eq('created_by', pu.id); } catch (e) { }

            // Teacher Schools (Junction)
            try { await supabase.from('teacher_schools').delete().eq('teacher_id', pu.id); } catch (e) { }

            // Student Linkage
            try { await supabase.from('students').update({ user_id: null }).eq('user_id', pu.id); } catch (e) { }

            // Files
            try { await supabase.from('files').update({ uploaded_by: null }).eq('uploaded_by', pu.id); } catch (e) { }

            // Course related
            try { await supabase.from('courses').update({ created_by: null }).eq('created_by', pu.id); } catch (e) { }
            try { await supabase.from('lessons').update({ created_by: null }).eq('created_by', pu.id); } catch (e) { }

            // 2. Delete Portal Row
            const { error: delErr } = await supabase.from('portal_users').delete().eq('id', pu.id);
            if (delErr) {
                console.error(`  ! Error deleting portal row: ${delErr.message}`);
            } else {
                console.log(`  ✓ Deleted portal_users row for ${pu.email}`);
            }

            // 3. Delete Auth User
            const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
            const matchedAuth = authUsers.find(u => u.id === pu.id || u.email?.toLowerCase() === pu.email.toLowerCase());
            if (matchedAuth) {
                const { error: authErr } = await supabase.auth.admin.deleteUser(matchedAuth.id);
                if (authErr) {
                    console.error(`  ! Error deleting auth user: ${authErr.message}`);
                } else {
                    console.log(`  ✓ Deleted auth user for ${matchedAuth.email}`);
                }
            }
        }
    } else {
        // If no portal row, still check auth by email
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
        const matchedAuth = authUsers.filter(u => u.email?.toLowerCase().includes(email.toLowerCase()));
        for (const au of matchedAuth) {
            console.log(`Targeting Auth User (no portal row): ${au.email} (${au.id})`);
            const { error: authErr } = await supabase.auth.admin.deleteUser(au.id);
            if (authErr) console.error(`  ! Error deleting auth user: ${authErr.message}`);
            else console.log(`  ✓ Deleted auth user for ${au.email}`);
        }
    }
}

async function run() {
    await purgeUser('admin@rillcod.com');
    await purgeUser('amaka@rillcod.com');
    await purgeUser('amaka2@rillcod.com');
    console.log('\n--- Atomic Purge Finished ---');
}

run().catch(console.error);
