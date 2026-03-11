import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Manual env loading
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env: any = {};
envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupData() {
    console.log('--- Data Cleanup: Syncing school_id based on school_name ---');

    // 1. Get all schools
    const { data: schools } = await supabase.from('schools').select('id, name');
    if (!schools) return;

    for (const school of schools) {
        console.log(`Processing school: ${school.name} (${school.id})`);

        // 2. Update portal_users
        const { data: puData, error: puErr } = await supabase
            .from('portal_users')
            .update({ school_id: school.id })
            .eq('school_name', school.name)
            .is('school_id', null)
            .select('id');

        if (puErr) console.error(`Error updating portal_users for ${school.name}:`, puErr);
        else console.log(`Updated ${puData?.length ?? 0} records in portal_users`);

        // 3. Update students (leads)
        const { data: sData, error: sErr } = await supabase
            .from('students')
            .update({ school_id: school.id })
            .eq('school_name', school.name)
            .is('school_id', null)
            .select('id');

        if (sErr) console.error(`Error updating students for ${school.name}:`, sErr);
        else console.log(`Updated ${sData?.length ?? 0} records in students`);
    }

    console.log('Cleanup complete.');
}

cleanupData();
