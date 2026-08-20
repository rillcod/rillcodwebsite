import { runSql } from './_credentials.mjs';

const checks = [
  `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_spr_student_term_course_id'`,
  `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260929000078'`,
];

for (const query of checks) {
  const result = await runSql(query);
  console.log(query);
  console.log(result.ok ? result.body : `FAILED: ${result.body}\n`);
}
