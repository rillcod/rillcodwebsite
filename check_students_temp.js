
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, count, error } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: false });

  if (error) {
    console.error('Error fetching students:', error);
    return;
  }

  console.log('Total students in DB:', count);
  if (data && data.length > 0) {
    console.log('First student sample:', {
      id: data[0].id,
      name: data[0].name,
      full_name: data[0].full_name,
      school_id: data[0].school_id,
      school_name: data[0].school_name,
      created_by: data[0].created_by
    });
  } else {
    console.log('No students found in the table.');
  }
}

check();
