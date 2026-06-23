const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== ASSIGNMENTS POLICIES ===");
        const policies = await sql`
            SELECT policyname, cmd, qual
            FROM pg_policies
            WHERE tablename = 'assignments'
            ORDER BY policyname;
        `;
        policies.forEach(p => {
            console.log(`\nPolicy: ${p.policyname}\nCmd: ${p.cmd}\nUsing: ${p.qual}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
