const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUnassigned() {
    const { data, error } = await supabase
        .from('portal_users')
        .select('id, full_name, role, email')
        .ilike('full_name', '%unassigned%');

    if (error) {
        console.error(error);
        return;
    }

    console.log('Unassigned users found:', data);
}

checkUnassigned();
