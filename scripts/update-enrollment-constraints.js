const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log('Modifying check constraints on portal_users table...');
        await sql`ALTER TABLE portal_users DROP CONSTRAINT IF EXISTS portal_users_enrollment_type_check;`;
        await sql`ALTER TABLE portal_users ADD CONSTRAINT portal_users_enrollment_type_check CHECK (enrollment_type IN ('school', 'bootcamp', 'online', 'in_person', 'summer_school'));`;
        console.log('Success for portal_users constraint!');

        console.log('Modifying check constraints on students table...');
        await sql`ALTER TABLE students DROP CONSTRAINT IF EXISTS students_enrollment_type_check;`;
        await sql`ALTER TABLE students ADD CONSTRAINT students_enrollment_type_check CHECK (enrollment_type IN ('school', 'bootcamp', 'online', 'in_person', 'summer_school'));`;
        console.log('Success for students constraint!');

        console.log('All constraints updated successfully!');
    } catch (err) {
        console.error('Error updating constraints:', err);
    } finally {
        await sql.end();
    }
}

run();
