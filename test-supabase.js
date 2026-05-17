require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb.from('invoices').select('*, portal_users(id, email, full_name, role), schools(name)').limit(1).single();
  console.log({ error, dataId: data?.id });
})();
