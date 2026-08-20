/**
 * Preflight + apply migration 20260929000078_merge_progress_report_duplicates.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSql } from './_credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(__dirname, '../supabase/migrations/20260929000078_merge_progress_report_duplicates.sql');

const PREFLIGHT = `
SELECT
  (SELECT count(*)::int
   FROM public.student_progress_reports spr
   JOIN public.academic_terms at ON at.id = spr.term_id
   WHERE spr.term_id IS NOT NULL
     AND (
       lower(btrim(coalesce(spr.report_term, ''))) IN ('current learning period', 'academic period to be confirmed')
       OR lower(btrim(coalesce(spr.report_period, ''))) IN ('current programme', 'current program', 'current learning period')
     )
  ) AS placeholder_labels_to_normalize,
  (SELECT count(*)::int
   FROM (
     SELECT student_id, term_id, course_id
     FROM public.student_progress_reports
     WHERE student_id IS NOT NULL AND term_id IS NOT NULL AND course_id IS NOT NULL
     GROUP BY student_id, term_id, course_id
     HAVING count(*) > 1
   ) dup_groups
  ) AS duplicate_groups,
  (SELECT coalesce(sum(cnt - 1), 0)::int
   FROM (
     SELECT count(*) AS cnt
     FROM public.student_progress_reports
     WHERE student_id IS NOT NULL AND term_id IS NOT NULL AND course_id IS NOT NULL
     GROUP BY student_id, term_id, course_id
     HAVING count(*) > 1
   ) counts
  ) AS duplicate_rows_to_drop;
`;

async function main() {
  console.log('Preflight: progress report duplicate merge\n');
  const pre = await runSql(PREFLIGHT);
  if (!pre.ok) {
    console.error(`Preflight failed (${pre.status}): ${pre.body}`);
    process.exit(1);
  }
  console.log(pre.body);

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  console.log('\nApplying migration 20260929000078_merge_progress_report_duplicates.sql ...\n');
  const applied = await runSql(sql);
  if (!applied.ok) {
    console.error(`Migration failed (${applied.status}): ${applied.body}`);
    process.exit(1);
  }
  console.log('Migration applied successfully.');
  console.log(applied.body || '(no rows returned)');

  const post = await runSql(PREFLIGHT);
  if (post.ok) {
    console.log('\nPostflight:');
    console.log(post.body);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
