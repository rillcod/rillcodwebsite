const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
    try {
        const tables = [
            'academic_terms',
            'payments',
            'invoices',
            'attendance',
            'class_sessions',
            'schools',
            'enrollments'
        ];
        
        for (const table of tables) {
            const { data, error } = await supabase.from(table).select('*').limit(1);
            if (error) {
                console.log(`${table}: Not Found or Error: ${error.message}`);
            } else if (data && data.length > 0) {
                console.log(`${table} Columns:`, Object.keys(data[0]));
            } else if (data) {
                console.log(`${table}: Found but Empty`);
            }
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

checkSchema();
