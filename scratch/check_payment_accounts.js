const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPaymentAccounts() {
    try {
        const { data, error } = await supabase
            .from('payment_accounts')
            .select('*');
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Success:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

checkPaymentAccounts();
