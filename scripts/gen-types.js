const postgres = require('postgres');
const fs = require('fs');

const sql = postgres('postgres://postgres.akaorqukdoawacvxsdij:rillcod12345%2E@aws-0-eu-central-1.pooler.supabase.com:6543/postgres', {
    ssl: 'require',
    max: 1
});

async function genTypes() {
    try {
        console.log('Fetching schema information...');
        const columns = await sql`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
        `;

        let typeContent = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
`;

        let currentTable = '';
        columns.forEach(col => {
            if (col.table_name !== currentTable) {
                if (currentTable) typeContent += `        }\n      }\n`;
                currentTable = col.table_name;
                typeContent += `      ${col.table_name}: {\n        Row: {\n`;
            }

            let tsType = 'any';
            switch (col.data_type) {
                case 'text':
                case 'uuid':
                case 'character varying':
                case 'timestamp with time zone':
                case 'date':
                case 'time without time zone':
                    tsType = 'string';
                    break;
                case 'integer':
                case 'numeric':
                case 'bigint':
                case 'double precision':
                    tsType = 'number';
                    break;
                case 'boolean':
                    tsType = 'boolean';
                    break;
                case 'jsonb':
                case 'json':
                    tsType = 'Json';
                    break;
            }

            if (col.is_nullable === 'YES') tsType += ' | null';
            typeContent += `          ${col.column_name}: ${tsType}\n`;
        });

        if (currentTable) typeContent += `        }\n      }\n`;
        typeContent += `    }\n    Views: {\n      [_ in never]: never\n    }\n    Functions: {\n      [_ in never]: never\n    }\n    Enums: {\n      [_ in never]: never\n    }\n    CompositeTypes: {\n      [_ in never]: never\n    }\n  }\n}\n`;

        fs.writeFileSync('src/types/supabase.ts', typeContent);
        console.log('✅ Generated src/types/supabase.ts (simplified)');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

genTypes();
