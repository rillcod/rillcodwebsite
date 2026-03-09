const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
    const testName = 'PersistTest_' + Date.now();
    console.log('Inserting school:', testName);

    const { data, error } = await supabase.from('schools').insert({
        name: testName,
        status: 'approved',
        is_active: true,
        is_deleted: false
    }).select().single();

    if (error) {
        console.error('Insert error:', error);
        return;
    }

    console.log('Inserted ID:', data.id);

    const { data: check, error: checkErr } = await supabase
        .from('schools')
        .select('*')
        .eq('id', data.id)
        .single();

    if (checkErr) {
        console.error('Fetch error after insert:', checkErr);
    } else {
        console.log('Successfully fetched from DB:', check.name);
    }
}

test();
