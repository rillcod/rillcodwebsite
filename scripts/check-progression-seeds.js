const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
  ssl: 'require',
  max: 1,
});

async function run() {
  try {
    const [summary] = await sql.unsafe(`
      select
        count(*)::int as total,
        count(*) filter (where metadata ? 'grade_key')::int as grade_specific,
        count(*) filter (where not (metadata ? 'grade_key'))::int as legacy
      from public.curriculum_project_registry
      where is_active = true
    `);
    console.log('summary:', summary);

    const byTrack = await sql.unsafe(`
      select
        track,
        count(*)::int as total,
        count(*) filter (where metadata ? 'grade_key')::int as grade_specific,
        count(*) filter (where not (metadata ? 'grade_key'))::int as legacy
      from public.curriculum_project_registry
      where is_active = true
      group by track
      order by track
    `);
    console.table(byTrack);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

run();
