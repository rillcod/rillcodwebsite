import { runSql } from './_credentials.mjs';

const sql = `
ALTER TABLE IF EXISTS public.assignment_submissions 
ADD COLUMN IF NOT EXISTS answers JSONB;
`;

console.log('Applying SQL migration...');

async function apply() {
    try {
        const { ok, status, body } = await runSql(sql);

        if (ok) {
            console.log('✅ assignment_submissions.answers column added successfully!');
            console.log('Response:', body);
        } else {
            console.error('❌ Failed:', status, body);
            console.log('Trying alternative approach...');
            // Maybe it's a different endpoint or there's some other problem.
            process.exit(1);
        }
    } catch (e) {
        console.error('Network error:', e.message);
        process.exit(1);
    }
}

apply();
