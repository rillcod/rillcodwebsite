const PROJECT_REF = 'akaorqukdoawacvxsdij';
const SERVICE_ROLE_KEY = 'sb_secret_Vdui5JfPYV553qZwmCHPbw_JWXmcfvW';

const sql = `
ALTER TABLE IF EXISTS public.assignment_submissions 
ADD COLUMN IF NOT EXISTS answers JSONB;
`;

console.log('Applying SQL migration...');

async function apply() {
    try {
        const res = await fetch(
            `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ query: sql }),
            }
        );

        const body = await res.text();

        if (res.ok) {
            console.log('✅ assignment_submissions.answers column added successfully!');
            console.log('Response:', body);
        } else {
            console.error('❌ Failed:', res.status, body);
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
