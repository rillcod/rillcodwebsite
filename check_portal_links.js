
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: schoolUsers } = await supabase.from('portal_users').select('id, full_name').eq('role', 'school');
  const schoolUserIds = schoolUsers?.map(u => u.id) || [];

  if (schoolUserIds.length === 0) {
    console.log('No portal users with role school found.');
    return;
  }

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, school_id')
    .in('school_id', schoolUserIds);

  console.log(`Found ${students?.length || 0} students linked directly to portal_user IDs.`);
  students?.forEach(s => {
      console.log(`- ${s.full_name}: school_id=${s.school_id}`);
  });
}

check();
