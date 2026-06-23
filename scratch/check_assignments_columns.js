const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'assignments';
        `;
        console.log('Columns in assignments table:');
        console.log(columns);
    } catch (err) {
        console.error('Error fetching columns:', err);
    } finally {
        await sql.end();
    }
}

run();
