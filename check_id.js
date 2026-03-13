
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const id = '344f1eeb-b175-4740-bf5b-5747a36a5de6';
  
  const { data: school } = await supabase.from('schools').select('id, name').eq('id', id).maybeSingle();
  const { data: portal } = await supabase.from('portal_users').select('id, full_name, role').eq('id', id).maybeSingle();

  console.log('ID:', id);
  console.log('In schools table:', school);
  console.log('In portal_users table:', portal);
}

check();
