import { runSql } from './_credentials.mjs';

const sql = `
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260929000078', 'merge_progress_report_duplicates')
ON CONFLICT (version) DO NOTHING;

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260929000078';
`;

const result = await runSql(sql);
if (!result.ok) {
  console.error(result.body);
  process.exit(1);
}
console.log(result.body);
