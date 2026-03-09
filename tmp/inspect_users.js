
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect(email) {
    console.log(`\n--- Inspecting: ${email} ---`);

    // 1. Auth
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const authMatch = authUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
    console.log('Auth Account:', authMatch ? { id: authMatch.id, email: authMatch.email } : 'NOT FOUND');

    // 2. Portal Users (search by email)
    const { data: portalRows } = await supabase
        .from('portal_users')
        .select('*')
        .eq('email', email);
    console.log('Portal User Rows (by email):', portalRows);

    if (portalRows && portalRows.length > 0) {
        for (const row of portalRows) {
            console.log(`  Checking dependencies for Portal ID: ${row.id}`);

            const tables = [
                'students', 'enrollments', 'payments', 'teacher_schools',
                'discussion_topics', 'discussion_replies', 'files',
                'exam_attempts', 'payment_transactions', 'leaderboards'
            ];

            for (const table of tables) {
                // Try different column names commonly used for user id
                const idCols = ['user_id', 'portal_user_id', 'created_by', 'teacher_id', 'uploaded_by', 'student_id'];
                for (const col of idCols) {
                    try {
                        const { count, error } = await supabase
                            .from(table)
                            .select('*', { count: 'exact', head: true })
                            .eq(col, row.id);

                        if (!error && count > 0) {
                            console.log(`    - Table '${table}' has ${count} records in column '${col}'`);
                        }
                    } catch (e) {
                        // ignore columns that don't exist in that table
                    }
                }
            }
        }
    }
}

async function run() {
    await inspect('admin@rillcod.com');
    await inspect('amaka@rillcod.com');
    await inspect('amaka2@rillcod.com');
}

run().catch(console.error);
