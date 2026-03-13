const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const tables = ['classes', 'courses', 'cbt_exams', 'assignments', 'students'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Error on ${table}:`, error.message);
      continue;
    }
    console.log(`Columns in ${table}:`, Object.keys(data[0] || {}).join(', '));
  }
}

check();
