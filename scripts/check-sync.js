const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function checkSync() {
    try {
        console.log('Fetching tables from remote DB...');
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `;

        console.log('Remote Tables:', tables.map(t => t.table_name).join(', '));

        // Check for specific critical tables from FINAL_TRUTH
        const criticalTables = ['portal_users', 'schools', 'courses', 'programs', 'enrollments'];
        const missing = criticalTables.filter(ct => !tables.find(t => t.table_name === ct));

        if (missing.length > 0) {
            console.log('❌ Warning: Missing critical tables:', missing.join(', '));
        } else {
            console.log('✅ Critical tables are present.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

checkSync();
