const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFullCleanup() {
  const scratchId = '940a46fb-a841-4dde-a7b5-722efc092dc0';
  console.log('--- TESTING FULL CASCADE CLEANUP FOR SCRATCH CURRICULUM ---');

  // Step 1: Find releases linked to this source_curriculum_id
  const { data: releases } = await supabase
    .from('academic_curriculum_releases')
    .select('id')
    .eq('source_curriculum_id', scratchId);

  console.log(`Found ${(releases || []).length} linked release(s):`, releases);

  if (releases && releases.length > 0) {
    const releaseIds = releases.map((r) => r.id);

    // 1a. Delete from academic_offering_curriculum_directions
    const { error: e1 } = await supabase
      .from('academic_offering_curriculum_directions')
      .delete()
      .in('release_id', releaseIds);
    console.log('Deleted from academic_offering_curriculum_directions:', e1 || 'SUCCESS');

    // 1b. Delete from academic_curriculum_adoptions
    const { error: e2 } = await supabase
      .from('academic_curriculum_adoptions')
      .delete()
      .in('release_id', releaseIds);
    console.log('Deleted from academic_curriculum_adoptions:', e2 || 'SUCCESS');

    // 1c. Delete from academic_pathways
    const { error: e3 } = await supabase
      .from('academic_pathways')
      .delete()
      .in('release_id', releaseIds);
    console.log('Deleted from academic_pathways:', e3 || 'SUCCESS');

    // 1d. Delete from academic_curriculum_quality_runs
    await supabase.from('academic_curriculum_quality_runs').delete().eq('curriculum_id', scratchId);

    // 1e. Delete releases directly
    const { error: relDelErr } = await supabase
      .from('academic_curriculum_releases')
      .delete()
      .in('id', releaseIds);
    console.log('Deleted academic_curriculum_releases:', relDelErr || 'SUCCESS');
  }

  // Step 2: Delete tracking & lesson plans
  await supabase.from('curriculum_week_tracking').delete().eq('curriculum_id', scratchId);

  // Step 3: Delete course_curricula row
  const { data, error } = await supabase
    .from('course_curricula')
    .delete()
    .eq('id', scratchId)
    .select();

  if (error) {
    console.error('FINAL DELETE FAILED:', error);
  } else {
    console.log('🎉 SUCCESS! DELETED Scratch course_curricula ROW:', data);
  }
}

testFullCleanup();
