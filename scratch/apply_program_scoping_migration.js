const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const sql = postgres('postgres://postgres:rillcod-academy-db-password@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

// Wait, let's use the correct connection string from run-migrations.js:
// postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres
const connStr = 'postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres';
const db = postgres(connStr, {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260501000061_assignment_program_scoping.sql');
        console.log('Reading migration file:', migrationPath);
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Executing migration SQL...');
        // We will execute the raw SQL script.
        await db.unsafe(migrationSql);
        console.log('Migration executed successfully!');
    } catch (err) {
        console.error('Error executing migration:', err);
    } finally {
        await db.end();
    }
}

run();
