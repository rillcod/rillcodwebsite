const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== assignment_submissions UNIQUE CONSTRAINTS ===");
        const constraints = await sql`
            SELECT conname, pg_get_constraintdef(oid) as def
            FROM pg_constraint
            WHERE conrelid = 'public.assignment_submissions'::regclass;
        `;
        constraints.forEach(c => {
            console.log(` - ${c.conname}: ${c.def}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
