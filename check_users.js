import postgres from 'postgres';

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', { ssl: 'require' });

async function checkAuth() {
    try {
        const authUsers = await sql`
      SELECT id, email, role FROM auth.users WHERE email LIKE '%rillcodacademy.com';
    `;
        console.log("Auth Users:");
        console.table(authUsers);

        const portalUsers = await sql`
      SELECT id, email, role, is_active FROM portal_users WHERE email LIKE '%rillcodacademy.com';
    `;
        console.log("Portal Users:");
        console.table(portalUsers);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkAuth();
