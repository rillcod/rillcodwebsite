const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        // 1. Get a summer student
        const student = await sql`
            SELECT id, email, full_name, role, enrollment_type, school_id, class_id
            FROM public.portal_users
            WHERE enrollment_type = 'summer_school' AND role = 'student'
            LIMIT 1;
        `;
        if (student.length === 0) {
            console.log("No summer student found.");
            return;
        }
        const s = student[0];
        console.log("Selected summer student:", s);

        // 2. Get enrollments for this student
        const enrollments = await sql`
            SELECT id, program_id, status FROM public.enrollments WHERE user_id = ${s.id};
        `;
        console.log("Enrollments:", enrollments);

        // 3. Find an active assignment in the student's program
        const programIds = enrollments.map(e => e.program_id);
        let assignment;
        if (programIds.length > 0) {
            const asgns = await sql`
                SELECT id, title, program_id, course_id, school_id, is_active
                FROM public.assignments
                WHERE is_active = true
                  AND (program_id = ANY(${programIds}) OR program_id IS NULL)
                LIMIT 1;
            `;
            assignment = asgns[0];
        }
        if (!assignment) {
            console.log("No active assignment found for this student's programs. Let's find any active assignment.");
            const asgns = await sql`
                SELECT id, title, program_id, course_id, school_id, is_active
                FROM public.assignments
                WHERE is_active = true
                LIMIT 1;
            `;
            assignment = asgns[0];
        }
        if (!assignment) {
            console.log("No active assignments in DB.");
            return;
        }
        console.log("Selected assignment:", assignment);

        // 4. Try the upsert under a transaction
        console.log("\n--- Executing dry-run upsert ---");
        await sql.begin(async sql => {
            const upsertData = {
                assignment_id: assignment.id,
                portal_user_id: s.id,
                submitted_at: new Date().toISOString(),
                status: 'submitted',
                updated_at: new Date().toISOString(),
                submission_text: 'Test submission from dry-run script',
                file_url: null,
                answers: null
            };
            const result = await sql`
                INSERT INTO public.assignment_submissions (
                    assignment_id, portal_user_id, submitted_at, status, updated_at, submission_text, file_url, answers
                ) VALUES (
                    ${upsertData.assignment_id}, ${upsertData.portal_user_id}, ${upsertData.submitted_at}, ${upsertData.status}, ${upsertData.updated_at}, ${upsertData.submission_text}, ${upsertData.file_url}, ${upsertData.answers}
                )
                ON CONFLICT (assignment_id, portal_user_id)
                DO UPDATE SET
                    submitted_at = EXCLUDED.submitted_at,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at,
                    submission_text = EXCLUDED.submission_text,
                    file_url = EXCLUDED.file_url,
                    answers = EXCLUDED.answers
                RETURNING *;
            `;
            console.log("Upsert succeeded! Result:", result[0]);
            
            // Roll back so we don't pollute database
            console.log("Rolling back dry run...");
            throw new Error("ROLLBACK");
        });

    } catch (err) {
        if (err.message === "ROLLBACK") {
            console.log("Transaction successfully rolled back (as planned). No errors encountered!");
        } else {
            console.error('Submission failed with error:', err);
        }
    } finally {
        await sql.end();
    }
}

run();
