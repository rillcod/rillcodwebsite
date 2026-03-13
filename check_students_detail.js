
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, school_id, school_name, created_by')
    .limit(50);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${data.length} students.`);
  data.forEach(s => {
    console.log(`- ${s.full_name}: school_id=${s.school_id}, school_name=${s.school_name}, created_by=${s.created_by}`);
  });
}

check();
