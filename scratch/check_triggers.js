const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== assignment_submissions TRIGGERS ===");
        const triggers = await sql`
            SELECT tgname, pg_get_triggerdef(oid) as def
            FROM pg_trigger
            WHERE tgrelid = 'public.assignment_submissions'::regclass;
        `;
        triggers.forEach(t => {
            console.log(` - ${t.tgname}: ${t.def}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
