const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEmptyNames() {
    const { data, error } = await supabase
        .from('portal_users')
        .select('id, full_name, role, email')
        .or('full_name.is.null,full_name.eq.""');

    if (error) {
        console.error(error);
        return;
    }

    console.log('Users with empty names found:', data);
}

checkEmptyNames();
