const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const getDBUrl = () => {
    // We already know the database URL from previous connections
    return 'postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres';
};

const sql = postgres(getDBUrl(), {
    ssl: 'require',
    max: 1 // only 1 connection
});

async function run() {
    try {
        console.log('Running lms_system_completion.sql...');
        const completionSql = fs.readFileSync(path.join(__dirname, 'database', 'lms_system_completion.sql'), 'utf8');
        await sql.unsafe(completionSql);
        console.log('Completed lms_system_completion.sql successfully.');

        console.log('Running lms_system_rls.sql...');
        const rlsSql = fs.readFileSync(path.join(__dirname, 'database', 'lms_system_rls.sql'), 'utf8');
        await sql.unsafe(rlsSql);
        console.log('Completed lms_system_rls.sql successfully.');

    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await sql.end();
        console.log('Done.');
    }
}

run();
