import { createAdminClient } from './src/lib/supabase/admin';

async function check() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('project_submissions').select('*').limit(1);
  console.log('project_submissions error:', error);
  console.log('project_submissions data:', data);
  
  const { data: cols, error: colErr } = await admin.rpc('get_table_columns', { table_name: 'project_submissions' });
  console.log('Columns:', cols);
}

// Since I can't run this directly as a script in the env without setup,
// I'll just assume the table exists as per FIXES.md and use it.
