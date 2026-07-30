const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFix() {
  const scratchId = '940a46fb-a841-4dde-a7b5-722efc092dc0';
  console.log('--- TESTING DELETING RELEASES FIRST INSTEAD OF UPDATING source_curriculum_id ---');

  // Step 1: Find releases linked to this source_curriculum_id
  const { data: releases } = await supabase
    .from('academic_curriculum_releases')
    .select('id')
    .eq('source_curriculum_id', scratchId);

  console.log(`Found ${(releases || []).length} linked release(s):`, releases);

  if (releases && releases.length > 0) {
    const releaseIds = releases.map((r) => r.id);

    // Delete adoptions
    await supabase.from('academic_curriculum_adoptions').delete().in('release_id', releaseIds);
    // Delete pathways
    await supabase.from('academic_pathways').delete().in('release_id', releaseIds);
    // Delete quality runs
    await supabase.from('academic_curriculum_quality_runs').delete().eq('curriculum_id', scratchId);

    // Delete releases directly
    const { error: relDelErr } = await supabase
      .from('academic_curriculum_releases')
      .delete()
      .in('id', releaseIds);

    if (relDelErr) {
      console.error('Failed to delete releases:', relDelErr);
    } else {
      console.log('Successfully deleted linked releases!');
    }
  }

  // Delete tracking & quality runs
  await supabase.from('curriculum_week_tracking').delete().eq('curriculum_id', scratchId);
  await supabase.from('academic_curriculum_quality_runs').delete().eq('curriculum_id', scratchId);

  // Now delete course_curricula row
  const { data, error } = await supabase
    .from('course_curricula')
    .delete()
    .eq('id', scratchId)
    .select();

  if (error) {
    console.error('DELETE FAILED:', error);
  } else {
    console.log('SUCCESS! DELETED course_curricula ROW:', data);
  }
}

testFix();
