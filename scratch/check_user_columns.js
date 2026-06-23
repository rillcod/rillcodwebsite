const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("\n=== RLS POLICIES FOR courses ===");
        const coursePolicies = await sql`
            SELECT policyname, cmd, roles, qual, with_check
            FROM pg_policies
            WHERE tablename = 'courses';
        `;
        console.table(coursePolicies);

        console.log("\n=== RLS POLICIES FOR lessons ===");
        const lessonPolicies = await sql`
            SELECT policyname, cmd, roles, qual, with_check
            FROM pg_policies
            WHERE tablename = 'lessons';
        `;
        console.table(lessonPolicies);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
