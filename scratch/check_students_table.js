const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== SUMMER/ONLINE PORTAL USERS ===");
        const summerUsers = await sql`
            SELECT id, email, full_name, role, enrollment_type, school_id, student_id
            FROM public.portal_users
            WHERE enrollment_type IN ('summer_school', 'online', 'online_school', 'bootcamp')
            LIMIT 10;
        `;
        console.table(summerUsers);

        console.log("\n=== STUDENTS RECORDS FOR THESE USERS ===");
        const userIds = summerUsers.map(u => u.id);
        if (userIds.length > 0) {
            const studentRecords = await sql`
                SELECT id, user_id, course_interest
                FROM public.students
                WHERE user_id = ANY(${userIds});
            `;
            console.table(studentRecords);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
