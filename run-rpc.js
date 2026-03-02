const postgres = require('postgres');
const fs = require('fs');

const getDBUrl = () => {
    return 'postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres';
};

const sql = postgres(getDBUrl(), {
    ssl: 'require',
    max: 1 // only 1 connection
});

async function run() {
    try {
        const queryFile = process.argv[2];
        if (!queryFile) {
            console.error('Please provide a sql file to run');
            process.exit(1);
        }
        console.log(`Running ${queryFile}...`);
        const querySql = fs.readFileSync(queryFile, 'utf8');
        await sql.unsafe(querySql);
        console.log(`Successfully executed ${queryFile}`);
    } catch (err) {
        console.error('Error executing query:', err);
    } finally {
        await sql.end();
    }
}

run();
