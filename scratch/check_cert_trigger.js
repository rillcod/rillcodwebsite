const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== handle_certificate_trigger DEFINITION ===");
        const func = await sql`
            SELECT pg_get_functiondef(oid) as def
            FROM pg_proc
            WHERE proname = 'handle_certificate_trigger';
        `;
        func.forEach(f => {
            console.log(f.def);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
