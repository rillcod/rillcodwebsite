const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCertificate() {
    try {
        const { data, error } = await supabase
            .from('certificates')
            .select('*, portal_users(full_name, class_id), courses(title, program_id)')
            .eq('certificate_number', 'RC-1774273301753-43')
            .single();
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Success:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

checkCertificate();
