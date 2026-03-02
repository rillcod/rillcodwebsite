const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1 // only 1 connection
});

async function run() {
    try {
        await sql`ALTER TABLE portal_users DROP CONSTRAINT IF EXISTS portal_users_role_check;`;
        const result2 = await sql`ALTER TABLE portal_users ADD CONSTRAINT portal_users_role_check CHECK (role IN ('admin', 'teacher', 'student', 'school', 'parent'));`;
        console.log('Success:', result2);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
