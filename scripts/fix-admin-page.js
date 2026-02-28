const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/admin/page.tsx');

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the problematic lines
  content = content.replace(
    /const supabase = createClient\(\);\s*const supabase = createClient\(\);\(\) {/,
    'const supabase = createClient();'
  );
  
  fs.writeFileSync(filePath, content);
  console.log('Fixed admin page');
} else {
  console.log('Admin page not found');
} 