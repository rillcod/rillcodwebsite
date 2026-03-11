import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'akaorqukdoawacvxsdij';
const SERVICE_ROLE_KEY = 'sb_secret_Vdui5JfPYV553qZwmCHPbw_JWXmcfvW';
const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');

// We only apply the ones we know are recent and likely unapplied
const recentMigrations = [
    '20260311000001_fix_content_library_rls.sql',
    '20260311000002_cbt_manual_grading.sql'
];

async function runMigration(fileName) {
    console.log(`\n📄 Processing: ${fileName}`);
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    const sql = fs.readFileSync(filePath, 'utf8');

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
            console.log(`✅ Success`);
        } else {
            console.error(`❌ Failed: ${res.status} ${body}`);
        }
    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
    }
}

async function main() {
    for (const file of recentMigrations) {
        await runMigration(file);
    }
}

main().catch(console.error);
