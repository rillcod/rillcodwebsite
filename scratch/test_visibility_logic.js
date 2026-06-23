import postgres from 'postgres';
import { assignmentVisibleToStudent, resolveStudentProgramScope } from '../src/lib/assignments/visibility';

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

const mockSupabaseAdmin = {
    from: (table) => {
        return {
            select: (columns) => {
                return {
                    eq: async (col, val) => {
                        const res = await sql`
                            SELECT id, program_id
                            FROM public.enrollments
                            WHERE user_id = ${val};
                        `;
                        return { data: res, error: null };
                    },
                    in: async (col, arr) => {
                        const res = await sql`
                            SELECT id
                            FROM public.courses
                            WHERE program_id = ANY(${arr});
                        `;
                        return { data: res, error: null };
                    }
                }
            }
        };
    }
};

async function run() {
    try {
        const student = await sql`
            SELECT id, email, full_name, role, enrollment_type, school_id, school_name, class_id, section_class, primary_teacher_id
            FROM public.portal_users
            WHERE enrollment_type = 'summer_school' AND role = 'student'
            LIMIT 1;
        `;
        if (student.length === 0) return;
        const s = student[0];
        console.log("Student:", s);

        const scope = await resolveStudentProgramScope(mockSupabaseAdmin, s.id);
        console.log("Student Scope:", {
            programIds: Array.from(scope.programIds),
            courseIds: Array.from(scope.courseIds)
        });

        // Get all active assignments
        const activeAsgns = await sql`
            SELECT id, title, program_id, course_id, school_id, school_name, class_id, created_by, metadata
            FROM public.assignments
            WHERE is_active = true;
        `;

        // Fetch creator roles
        const creatorIds = Array.from(new Set(activeAsgns.map((r) => r.created_by).filter(Boolean)));
        let creatorRoles = {};
        if (creatorIds.length > 0) {
            const users = await sql`
                SELECT id, role FROM public.portal_users WHERE id = ANY(${creatorIds});
            `;
            users.forEach((u) => {
                creatorRoles[u.id] = u.role;
            });
        }

        console.log("\nVisibility Results:");
        for (const a of activeAsgns) {
            const visible = assignmentVisibleToStudent(a, s, scope, creatorRoles, null);
            console.log(` - Assignment "${a.title}" (ID: ${a.id}, program_id: ${a.program_id}, school_id: ${a.school_id}): Visible? ${visible}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

run();
