const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1 // only 1 connection
});

async function run() {
    try {
        await sql`DROP POLICY IF EXISTS "Schools can view their students" ON students;`;
        await sql`
            CREATE POLICY "Schools can view their students" ON students
            FOR SELECT USING (
                school_id IN (
                    SELECT school_id FROM portal_users WHERE id = auth.uid() AND role = 'school'
                )
            );
        `;

        await sql`DROP POLICY IF EXISTS "Schools can read their own account" ON portal_users;`;
        await sql`
            CREATE POLICY "Schools can read their own account" ON portal_users
            FOR SELECT USING (
                id = auth.uid()
            );
        `;

        await sql`DROP POLICY IF EXISTS "Schools can update their own account" ON portal_users;`;
        await sql`
            CREATE POLICY "Schools can update their own account" ON portal_users
            FOR UPDATE USING (
                id = auth.uid()
            );
        `;

        console.log('Successfully added school RLS policies');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
