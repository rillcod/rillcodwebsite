const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const DB_URL = 'postgres://postgres.akaorqukdoawacvxsdij:rillcod12345%2E@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const sql = postgres(DB_URL, {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20240304000000_security_hardening.sql');
        console.log(`Reading migration from: ${migrationPath}`);

        if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file not found: ${migrationPath}`);
        }

        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Applying security hardening policy...');

        // Use unsafe for raw multi-statement SQL
        await sql.unsafe(migrationSql);

        console.log('Successfully applied security hardening policy.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        if (err.notice) console.error('Notice:', err.notice);
    } finally {
        await sql.end();
        console.log('Connection closed.');
    }
}

run();
