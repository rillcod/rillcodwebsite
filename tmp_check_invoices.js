const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkInvoices() {
    try {
        const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error('Error:', error);
        } else if (data && data.length > 0) {
            console.log('Invoice Columns:', Object.keys(data[0]));
        } else {
            console.log('Invoice table is empty.');
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

checkInvoices();
