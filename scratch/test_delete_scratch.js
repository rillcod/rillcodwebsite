const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDelete() {
  const scratchId = '940a46fb-a841-4dde-a7b5-722efc092dc0';
  console.log(`Attempting to delete course_curricula ID: ${scratchId}...`);

  // Direct Supabase delete attempt
  const { data, error } = await supabase
    .from('course_curricula')
    .delete()
    .eq('id', scratchId)
    .select();

  if (error) {
    console.error('DELETE FAILED WITH DB ERROR:', error);
  } else {
    console.log('DELETE SUCCEEDED! Deleted rows:', data);
  }
}

testDelete();
