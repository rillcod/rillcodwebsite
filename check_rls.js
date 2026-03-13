
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.rpc('get_policies', { table_name: 'students' });
  
  if (error) {
    // If rpc doesn't exist, try querying pg_policies
    const { data: policies, error: err2 } = await supabase
        .from('pg_policies')
        .select('*')
        .eq('tablename', 'students');
    
    if (err2) {
        // Try raw query if possible, but we can't do raw sql easily.
        // Let's at least check if RLS is enabled.
        console.log('Could not fetch policies via RPC or standard table. Trying to check if RLS is enabled...');
        return;
    }
    console.log('Policies on students table:', policies);
  } else {
    console.log('Policies on students table:', data);
  }
}

// Since we likely can't query pg_policies directly via anon/service role without an RPC,
// let's try a different approach: check if we can see rows with anon key vs service role.

async function checkAccess() {
    const supabaseService = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const supabaseAnon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { count: serviceCount } = await supabaseService.from('students').select('*', { count: 'exact', head: true });
    const { count: anonCount } = await supabaseAnon.from('students').select('*', { count: 'exact', head: true });

    console.log('Service Role Count:', serviceCount);
    console.log('Anon Role Count:', anonCount);
}

checkAccess();
