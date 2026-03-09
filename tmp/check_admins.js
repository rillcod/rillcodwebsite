
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkAdmins() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: admins } = await supabase.from('portal_users').select('email, role').eq('role', 'admin');
    console.log('Current Admins:', admins);
}

checkAdmins();
