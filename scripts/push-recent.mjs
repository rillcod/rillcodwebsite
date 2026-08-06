import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { runSql } from './_credentials.mjs';
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
        const { ok, status, body } = await runSql(sql);
        if (ok) {
            console.log(`✅ Success`);
        } else {
            console.error(`❌ Failed: ${status} ${body}`);
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
