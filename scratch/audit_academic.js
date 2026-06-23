const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== COURSES COLUMNS ===");
        const courseCols = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'courses';
        `;
        courseCols.forEach(c => {
            console.log(` - ${c.column_name}: ${c.data_type}`);
        });

        console.log("\n=== LESSONS COLUMNS ===");
        const lessonCols = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'lessons';
        `;
        lessonCols.forEach(c => {
            console.log(` - ${c.column_name}: ${c.data_type}`);
        });

        console.log("\n=== PROGRAMS IN DB ===");
        const programs = await sql`
            SELECT id, name, is_active
            FROM public.programs;
        `;
        console.table(programs);

        console.log("\n=== SAMPLE COURSES ===");
        const courses = await sql`
            SELECT id, title, program_id, school_id, is_active
            FROM public.courses
            LIMIT 10;
        `;
        console.table(courses);

        console.log("\n=== SAMPLE LESSONS ===");
        const lessons = await sql`
            SELECT id, title, course_id, status, lesson_type, order_index
            FROM public.lessons
            LIMIT 10;
        `;
        console.table(lessons);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
