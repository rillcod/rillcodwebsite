const fs = require('fs');
const path = require('path');

const files = [
  'src/lib/stores/teacher-store.ts',
  'src/components/LoginForm.tsx',
  'src/components/SchoolRegistrationsViewer.tsx',
  'src/components/SupabaseTableChecker.tsx',
  'src/components/StudentRegistration.tsx',
  'src/components/SchoolRegistration.tsx',
  'src/components/admin/TeacherManagement.tsx',
  'src/components/admin/StudentApproval.tsx',
  'src/components/auth/PortalAccess.tsx',
  'src/components/auth/RegisterForm.tsx',
  'src/components/auth/LoginForm.tsx',
  'src/components/AddStudentModal.tsx',
  'src/app/admin/teachers/page.tsx',
  'src/app/admin/users/page.tsx',
  'src/app/test-schema/page.tsx',
  'src/app/admin/teacher-approvals/page.tsx',
  'src/app/test-db/page.tsx',
  'src/app/admin/settings/page.tsx',
  'src/app/teacher/page.tsx',
  'src/app/teacher/dashboard/page.tsx',
  'src/app/student/page.tsx',
  'src/app/student/dashboard/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/materials/page.tsx',
  'src/app/admin/materials/[id]/page.tsx',
  'src/app/admin/enrollments/page.tsx',
  'src/app/admin/enrollments/[id]/page.tsx',
  'src/app/admin/create/page.tsx',
  'src/app/admin/communications/page.tsx',
  'src/app/admin/cbt/page.tsx',
  'src/app/admin/classes/[id]/page.tsx',
  'src/app/admin/approvals/page.tsx',
  'src/app/database-sync/page.tsx',
  'src/app/admin/analytics/page.tsx',
  'src/app/api/students/route.ts',
  'src/app/auth/teacher/page.tsx',
  'src/app/auth/register/page.tsx',
  'src/app/admin/courses/page.tsx'
];

files.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace the import
    content = content.replace(
      /import\s*{\s*supabase\s*}\s*from\s*['"]@\/lib\/supabase['"];?/g,
      `import { createClient } from '@/utils/supabase/client';`
    );
    
    // Add supabase client initialization if it's a client component
    if (content.includes('use client') || content.includes('useState') || content.includes('useEffect')) {
      // Find the function declaration
      const functionMatch = content.match(/export\s+default\s+function\s+(\w+)\s*\([^)]*\)\s*{/);
      if (functionMatch) {
        const functionName = functionMatch[1];
        const functionStart = functionMatch[0];
        const newFunctionStart = functionStart.replace(
          /{/,
          '{\n  const supabase = createClient();'
        );
        content = content.replace(functionStart, newFunctionStart);
      }
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
}); 