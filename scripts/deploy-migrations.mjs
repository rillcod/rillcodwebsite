import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');
const DB_URL = 'postgres://postgres.akaorqukdoawacvxsdij:rillcod12345%2E@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const sql = postgres(DB_URL, {
    ssl: 'require',
    max: 1
});

async function deploy() {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    console.log(`🚀 Found ${files.length} migrations...`);

    for (const file of files) {
        if (!file.endsWith('.sql')) continue;
        console.log(`\n📄 Applying: ${file}`);
        const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        try {
            // Split by semicolon? No, unsafe() handles multiple statements usually
            // However, Supabase migrations can be large.
            await sql.unsafe(sqlContent);
            console.log(`✅ Success`);
        } catch (err) {
            console.error(`❌ Failed: ${err.message}`);
            // We continue because some might already be applied or have partial errors
            if (err.message.includes('already exists') || err.message.includes('already a member')) {
                console.log('ℹ️ Skipping (already applied)');
            }
        }
    }

    console.log('\n✨ All migrations processed.');
    await sql.end();
}

deploy().catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
});
