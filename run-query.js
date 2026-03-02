const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRLS() {
    try {
        const { data, error } = await supabase.rpc('execute_sql', {
            sql: "SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'students';"
        });
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Success:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

checkRLS();
