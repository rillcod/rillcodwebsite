const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('=== DB LEVEL DIAGNOSTIC FOR CURRICULUM DATA ===\n');

  const tables = [
    'course_curricula',
    'academic_curriculum_releases',
    'academic_pathways',
    'academic_curriculum_quality_runs',
    'lesson_plans',
    'lessons',
    'curriculum_week_tracking',
    'programs',
    'courses',
    'classes'
  ];

  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
      if (error) {
        console.log(`Table ${t}: Error - ${error.message}`);
      } else {
        console.log(`Table ${t}: ${count} rows`);
      }
    } catch (e) {
      console.log(`Table ${t}: Exception - ${e.message}`);
    }
  }

  console.log('\n--- DETAILED BREAKDOWN OF ALL course_curricula ROWS ---');
  const { data: curricula, error: currErr } = await supabase
    .from('course_curricula')
    .select('id, course_id, school_id, is_visible_to_school, version, created_at, courses(title)');

  if (currErr) {
    console.error('Error fetching course_curricula:', currErr);
  } else {
    console.log(`Found ${curricula.length} course_curricula row(s):`);
    curricula.forEach((c, idx) => {
      console.log(`[${idx + 1}] ID: ${c.id}`);
      console.log(`    Course: ${c.courses?.title || 'Unknown'} (${c.course_id})`);
      console.log(`    School ID: ${c.school_id || 'NULL (Global Template)'}`);
      console.log(`    Version: ${c.version}, Visible to School: ${c.is_visible_to_school}`);
      console.log(`    Created At: ${c.created_at}`);
    });
  }

  console.log('\n--- DEPENDENCY INSPECTION: WHAT IS HOLDING THESE ROWS? ---');

  // Check academic_curriculum_releases
  const { data: releases } = await supabase.from('academic_curriculum_releases').select('id, course_id, version_tag, source_curriculum_id, status');
  console.log(`academic_curriculum_releases: ${(releases || []).length} row(s)`);
  (releases || []).forEach(r => {
    console.log(`  - Release ID: ${r.id}, Course: ${r.course_id}, Tag: ${r.version_tag}, Source Curriculum ID: ${r.source_curriculum_id}, Status: ${r.status}`);
  });

  // Check lesson_plans linked to curriculum_version_id
  const { data: lessonPlans } = await supabase.from('lesson_plans').select('id, title, class_id, curriculum_version_id, status');
  console.log(`lesson_plans linked: ${(lessonPlans || []).length} total row(s)`);
  const linkedPlans = (lessonPlans || []).filter(lp => lp.curriculum_version_id);
  console.log(`  - Lesson plans with curriculum_version_id: ${linkedPlans.length}`);
  linkedPlans.forEach(lp => {
    console.log(`    Plan ID: ${lp.id}, Title: ${lp.title}, Class: ${lp.class_id}, Linked Version ID: ${lp.curriculum_version_id}, Status: ${lp.status}`);
  });

  // Check curriculum_week_tracking
  const { data: tracking } = await supabase.from('curriculum_week_tracking').select('id, curriculum_id, week, status');
  console.log(`curriculum_week_tracking: ${(tracking || []).length} row(s)`);
  (tracking || []).forEach(tr => {
    console.log(`  - Tracking ID: ${tr.id}, Curriculum ID: ${tr.curriculum_id}, Week: ${tr.week}, Status: ${tr.status}`);
  });

  // Check academic_pathways
  const { data: pathways } = await supabase.from('academic_pathways').select('id, name, course_id, release_id, is_active');
  console.log(`academic_pathways: ${(pathways || []).length} row(s)`);
  (pathways || []).forEach(pw => {
    console.log(`  - Pathway ID: ${pw.id}, Name: ${pw.name}, Course: ${pw.course_id}, Release ID: ${pw.release_id}, Active: ${pw.is_active}`);
  });

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

diagnose();
