const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function auditDatabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc('get_table_names'); // We might not have this RPC

    if (error) {
        // Fallback: Query information_schema
        const { data: tables, error: tableError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public');

        if (tableError) {
            // Another fallback: just try to count common tables
            console.error('Failed to query information_schema:', tableError);

            // Try a raw query if possible, or just list what we think we have
            const { data: countData, error: countError } = await supabase.rpc('count_tables');
            if (countError) {
                console.error('RPC count_tables failed. Trying another way.');
            }
        } else {
            console.log(`Total Tables: ${tables.length}`);
            tables.forEach(t => console.log(`- ${t.table_name}`));
        }
    } else {
        console.log(`Total Tables: ${data.length}`);
        data.forEach(t => console.log(`- ${t}`));
    }
}

// Since I can't easily run arbitrary JS without a runner, I'll use psql via run_command if possible
// But wait, I can just use curl to the Supabase API to get table list if I have service role key
// Actually, standard data API doesn't allow querying information_schema easily unless enabled.

auditDatabase();
