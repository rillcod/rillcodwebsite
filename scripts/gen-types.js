const { execSync } = require('node:child_process');

function genTypes() {
  try {
    execSync('npx supabase gen types typescript --linked > src/types/supabase.ts', {
      stdio: 'inherit',
      shell: true,
    });
    console.log('✅ Generated src/types/supabase.ts from linked Supabase project');
  } catch (error) {
    console.error('Failed to generate types from linked Supabase:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

genTypes();
