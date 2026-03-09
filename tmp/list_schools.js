const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function list() {
    const { data, error } = await supabase.from('schools').select('id, name, email, status, is_deleted, is_active, enrollment_types');
    if (error) {
        console.error(error);
        return;
    }
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

list();
