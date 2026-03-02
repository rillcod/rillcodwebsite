const { Client } = require('pg');
const fs = require('fs');

const connStr = 'postgres://postgres.akaorqukdoawacvxsdij:rillcod12345.@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function generateSchema() {
    const client = new Client({ connectionString: connStr });
    await client.connect();

    try {
        let sqlFile = `-- ==================================================================\n`;
        sqlFile += `-- SINGLE FILE OF TRUTH: GENERATED FROM REMOTE DATABASE STATE\n`;
        sqlFile += `-- ==================================================================\n\n`;

        // 1. Get Tables under schema 'public'
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);

        for (const row of tablesRes.rows) {
            const tableName = row.table_name;
            sqlFile += `-- TABLE: ${tableName}\n`;
            sqlFile += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;

            // Columns
            const colsRes = await client.query(`
                SELECT column_name, data_type, character_maximum_length, 
                       column_default, is_nullable
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position;
            `, [tableName]);

            const colDefs = colsRes.rows.map(c => {
                let type = c.data_type === 'USER-DEFINED' ? 'TEXT' : c.data_type; // Simplifying enums/custom types
                if (c.data_type === 'character varying' && c.character_maximum_length) {
                    type = `VARCHAR(${c.character_maximum_length})`;
                }
                if (c.data_type === 'timestamp with time zone') type = 'TIMESTAMPTZ';
                if (c.data_type === 'timestamp without time zone') type = 'TIMESTAMP';

                let def = `  ${c.column_name} ${type}`;
                if (c.column_default) {
                    let dflt = c.column_default;
                    // Fix defaults like 'now()' to 'NOW()' for consistency
                    def += ` DEFAULT ${dflt}`;
                }
                if (c.is_nullable === 'NO') def += ' NOT NULL';
                return def;
            });

            sqlFile += colDefs.join(',\n');
            sqlFile += `\n);\n\n`;

            // Primary Keys / Foreign Keys are hard to parse from catalog exactly quickly,
            // but we can query them if needed. For now, let's just dump Policies to check for conflicts.
        }

        // 2. Fetch Policies
        sqlFile += `-- ==================================================================\n`;
        sqlFile += `-- RLS POLICIES\n`;
        sqlFile += `-- ==================================================================\n\n`;

        const polRes = await client.query(`
            SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
            FROM pg_policies 
            WHERE schemaname = 'public'
            ORDER BY tablename, policyname;
        `);

        for (const p of polRes.rows) {
            sqlFile += `-- Policy on ${p.tablename}: ${p.policyname}\n`;
            sqlFile += `CREATE POLICY "${p.policyname}" ON public.${p.tablename} FOR ${p.cmd}`;
            if (p.roles && p.roles[0] !== 'public') {
                sqlFile += ` TO ${p.roles.join(', ')}`;
            }
            if (p.qual) sqlFile += `\n  USING (${p.qual})`;
            if (p.with_check) sqlFile += `\n  WITH CHECK (${p.with_check})`;
            sqlFile += `;\n\n`;
        }

        fs.writeFileSync('database/live_truth_schema.sql', sqlFile);
        console.log('Schema generated at database/live_truth_schema.sql');

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

generateSchema();
