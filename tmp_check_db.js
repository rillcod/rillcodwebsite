const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error('Error fetching from system_settings:', error);
        } else if (data && data.length > 0) {
            console.log('Columns found:', Object.keys(data[0]));
        } else {
            console.log('Table found but empty.');
            // Try to add one row and delete it maybe? No, let's just try to select one.
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

checkColumns();
