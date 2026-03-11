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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debugStudents() {
    console.log('--- Debugging Portal Users ---');

    // 1. Check portal_users roles
    const { data: roles, error: rolesError } = await supabase
        .from('portal_users')
        .select('role, count')
        .select('role');

    const roleCounts = roles?.reduce((acc: any, curr: any) => {
        acc[curr.role] = (acc[curr.role] || 0) + 1;
        return acc;
    }, {});
    console.log('Role counts in portal_users:', roleCounts);

    // 2. Check school managers
    const { data: schoolManagers, error: smError } = await supabase
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name')
        .eq('role', 'school');

    console.log('School Managers:', schoolManagers);

    // 3. Check students and their school associations
    const { data: students, error: sError } = await supabase
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name')
        .eq('role', 'student')
        .limit(10);

    console.log('Sample Students:', students);

    // 4. Check for students with NO school_id but maybe school_name
    const { data: orphans, error: oError } = await supabase
        .from('portal_users')
        .select('id, full_name, school_id, school_name')
        .eq('role', 'student')
        .is('school_id', null);

    console.log('Students with NULL school_id:', orphans?.length);
    if (orphans && orphans.length > 0) {
        console.log('Sample orphans:', orphans.slice(0, 5));
    }

    // 5. Check students table (leads)
    const { data: studentsTable, error: stError } = await supabase
        .from('students')
        .select('id, full_name, school_id, school_name')
        .limit(10);
    console.log('Sample Students in students table:', studentsTable);

    const { data: orphansSt, error: ostError } = await supabase
        .from('students')
        .select('id, full_name, school_id, school_name')
        .is('school_id', null);
    console.log('Students in students table with NULL school_id:', orphansSt?.length);

    // 6. Check Schools table
    const { data: schools, error: schError } = await supabase
        .from('schools')
        .select('id, name');
    console.log('Schools in DB:', schools);
}

debugStudents();
