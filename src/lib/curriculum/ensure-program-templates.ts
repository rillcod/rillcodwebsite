import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function ensureProgramTemplates(programId: string) {
  if (!programId) return;

  const admin = getAdminClient();

  // 1. Check if templates already exist for this program
  const { count, error: countErr } = await admin
    .from('platform_syllabus_week_template')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId);

  if (countErr) {
    console.error('Error checking program templates:', countErr);
    return;
  }

  if (count && count > 0) {
    // Templates already exist, nothing to do
    return;
  }

  // 2. Templates do not exist. Find the source program to copy from.
  // We look for a program that has seeded templates.
  const { data: sourceRows, error: srcErr } = await admin
    .from('platform_syllabus_week_template')
    .select('program_id')
    .limit(1);

  if (srcErr || !sourceRows || sourceRows.length === 0) {
    console.error('No source templates found to clone from.');
    return;
  }

  const sourceProgramId = sourceRows[0].program_id;

  // Fetch the target program details (to get its name and scope)
  const { data: targetProgram, error: progErr } = await admin
    .from('programs')
    .select('name, program_scope')
    .eq('id', programId)
    .single();

  if (progErr || !targetProgram) {
    console.error('Target program not found:', progErr);
    return;
  }

  // Fetch all templates from the source program
  const { data: templates, error: templatesErr } = await admin
    .from('platform_syllabus_week_template')
    .select('*')
    .eq('program_id', sourceProgramId);

  if (templatesErr || !templates || templates.length === 0) {
    console.error('Failed to fetch source templates:', templatesErr);
    return;
  }

  console.log(`Cloning ${templates.length} syllabus templates from program ${sourceProgramId} to target program ${programId} (${targetProgram.name})...`);

  // Clone templates
  const cloned = templates.map((t: any) => {
    // Intelligently adjust topic if the program has a custom scope (like summer school, online, bootcamp)
    let adjustedTopic = t.topic;
    if (['summer_school', 'online', 'bootcamp'].includes(targetProgram.program_scope ?? '')) {
      // Split the topic: e.g. "Basic 4 · python · Y1 T1 W1 — Guided build"
      // or "JSS 1 · jss web app · Y1 T1 W1 — Guided build"
      const parts = t.topic.split(' · ');
      if (parts.length >= 3) {
        // Replace the grade label (parts[0]) with the program name
        parts[0] = targetProgram.name;
        adjustedTopic = parts.join(' · ');
      } else {
        adjustedTopic = `${targetProgram.name} · ${t.topic}`;
      }
    }

    const { id, created_at, ...rest } = t;
    return {
      ...rest,
      program_id: programId,
      topic: adjustedTopic,
      metadata: {
        ...(t.metadata || {}),
        cloned_from_program: sourceProgramId,
        cloned_at: new Date().toISOString()
      }
    };
  });

  // Bulk insert cloned templates
  const batchSize = 100;
  for (let i = 0; i < cloned.length; i += batchSize) {
    const chunk = cloned.slice(i, i + batchSize);
    const { error: insertErr } = await admin
      .from('platform_syllabus_week_template')
      .insert(chunk);

    if (insertErr) {
      console.error('Error inserting cloned templates chunk:', insertErr);
      break;
    }
  }
  console.log(`Templates cloned successfully for program ${programId}.`);
}
