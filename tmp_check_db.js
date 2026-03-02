const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://akaorqukdoawacvxsdij.supabase.co';
const supabaseKey = 'sb_secret_Vdui5JfPYV553qZwmCHPbw_JWXmcfvW'; // service role key

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    const { data, error } = await supabase.rpc('get_table_count');
    if (error) {
        // If RPC doesn't exist, try a direct query via a function we might need to create
        // Or just list tables via a known table if we have an edge function
        console.error('Error calling rpc:', error);

        // Alternative: query information_schema via a new migration if needed, 
        // but we can just use the CLI to verify if we can.
    } else {
        console.log('Table count:', data);
    }
}

// Since I can't easily run arbitrary SQL via the JS client without a stored procedure,
// I'll use the CLI to create a temporary function that returns the count.

checkTables();
