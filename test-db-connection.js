const postgres = require('postgres');

// Try common local Supabase settings
const configs = [
    'postgres://postgres:postgres@127.0.0.1:54322/postgres',
    'postgres://postgres:postgres@localhost:54322/postgres',
    'postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.com:5432/postgres',
    'postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres'
];

async function check() {
    for (const url of configs) {
        console.log('Checking:', url.replace(/:[^:@]+@/, ':***@'));
        const sql = postgres(url, { max: 1, timeout: 5 });
        try {
            const res = await sql`SELECT version();`;
            console.log('Succeeded with:', url.replace(/:[^:@]+@/, ':***@'));
            console.log('Result:', res);
            process.exit(0);
        } catch (err) {
            console.log('Failed:', err.message);
        } finally {
            await sql.end();
        }
    }
    console.log('All failed');
    process.exit(1);
}

check();
